use crate::{ClientError, contract::CONTRACT};
use serde::Deserialize;
use serde_json::Value;
use std::{collections::BTreeMap, sync::LazyLock};
use uuid::Uuid;

pub fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field].as_str().unwrap_or("")
}
pub fn rows<'a>(value: &'a Value, field: &str) -> &'a [Value] {
    value[field].as_array().map(Vec::as_slice).unwrap_or(&[])
}
static EVENT: LazyLock<jsonschema::Validator> =
    LazyLock::new(|| jsonschema::validator_for(&CONTRACT["event"]).unwrap());
static SNAPSHOT: LazyLock<jsonschema::Validator> =
    LazyLock::new(|| jsonschema::validator_for(&CONTRACT["projections"]["conversation"]).unwrap());
#[derive(Clone, Deserialize)]
#[non_exhaustive]
pub struct EventPage {
    pub events: Vec<Value>,
    pub next_cursor: u64,
}

/// A cursor is meaningful only with this in-memory projection. Nothing persists a
/// lone cursor; every process/reconnect can establish a fresh atomic snapshot.
pub struct Conversation {
    value: Value,
    cursor: u64,
}
impl Conversation {
    pub fn new(value: Value, thread: Uuid) -> Result<Self, ClientError> {
        if !SNAPSHOT.is_valid(&value) {
            return Err(ClientError::ShapeMismatch);
        }
        if value["thread"]["id"] != thread.to_string() {
            return Err(ClientError::WrongThread);
        }
        Ok(Self {
            cursor: value["cursor"].as_u64().ok_or(ClientError::ShapeMismatch)?,
            value,
        })
    }
    pub fn value(&self) -> &Value {
        &self.value
    }
    pub fn cursor(&self) -> u64 {
        self.cursor
    }
    pub fn apply(&mut self, page: EventPage) -> Result<bool, ClientError> {
        let mut previous = self.cursor;
        let mut seen = std::collections::BTreeSet::new();
        let mut dirty = false;
        for event in &page.events {
            if !EVENT.is_valid(event) {
                return Err(ClientError::ShapeMismatch);
            }
            let cursor = event["cursor"].as_u64().unwrap();
            if cursor <= self.cursor || !seen.insert(cursor) {
                continue;
            }
            if event["data"]["id"] != event["entity_id"]
                || event["data"]["revision"] != event["revision"]
                || event["owner_id"] != self.value["thread"]["owner_id"]
            {
                return Err(ClientError::ShapeMismatch);
            }
            if cursor <= previous {
                return Err(ClientError::ShapeMismatch);
            }
            previous = cursor;
        }
        if page.next_cursor < previous {
            return Err(ClientError::ShapeMismatch);
        }
        for event in page.events {
            let cursor = event["cursor"].as_u64().unwrap();
            if cursor <= self.cursor {
                continue;
            }
            let kind = text(&event, "entity_kind");
            let data = &event["data"];
            let scoped = event["conversation_thread_id"] == self.value["thread"]["id"]
                || data["thread_id"] == self.value["thread"]["id"];
            if kind == "agent" || kind == "thread" {
                dirty = true;
            }
            if scoped {
                dirty = true;
                let field = match kind {
                    "message" => "messages",
                    "run" => "runs",
                    "control" => "controls",
                    "artifact" => "artifacts",
                    "goal" => "goals",
                    "routine" => "routines",
                    "human_request" => "human_requests",
                    _ => "",
                };
                if let Some(values) = self.value[field].as_array_mut() {
                    upsert(values, data.clone());
                }
            }
            self.cursor = cursor;
        }
        self.cursor = page.next_cursor;
        Ok(dirty)
    }
    pub fn merge_history(&mut self, history: &Value) {
        for message in rows(history, "messages") {
            if message["thread_id"] == self.value["thread"]["id"] {
                upsert(
                    self.value["messages"].as_array_mut().unwrap(),
                    message.clone(),
                );
            }
        }
    }
    pub fn retained_messages(&self) -> BTreeMap<String, Value> {
        rows(&self.value, "messages")
            .iter()
            .map(|m| (text(m, "id").into(), m.clone()))
            .collect()
    }
}
fn upsert(values: &mut Vec<Value>, value: Value) {
    if let Some(old) = values.iter_mut().find(|old| old["id"] == value["id"]) {
        if old["revision"].as_u64() < value["revision"].as_u64() {
            *old = value;
        }
    } else {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn revisions_overlap_deletion_and_scope_keep_one_authoritative_message() {
        std::thread::Builder::new().stack_size(16*1024*1024).spawn(||{
            let mut snapshot:Value=serde_json::from_str(include_str!("../../../verification/snapshot.json")).unwrap();
            let thread=snapshot["thread"]["id"].as_str().unwrap().parse().unwrap();
            snapshot["messages"]=json!([{ "id":"beed9ea1-8028-4d34-9d62-eaf103b5118f", "kind":"message", "owner_id":snapshot["thread"]["owner_id"], "thread_id":thread,"revision":1,"created_at":"2026-11-07T12:24:48.184Z","updated_at":"2026-11-07T12:24:48.184Z","author":"user","author_agent_id":null,"routine_id":null,"run_id":null,"purpose":"conversation","source_run_id":null,"creation_operation_id":null,"text":"Original","state":"complete","artifact_ids":[]}]);
            let mut projection=Conversation::new(snapshot.clone(),thread).unwrap();let cursor=projection.cursor();
            let mut message=snapshot["messages"][0].clone();message["revision"]=json!(2);message["text"]=json!("Updated 😀");
            let event=|cursor,message:&Value|json!({"conversation_thread_id":thread,"schema_version":1,"cursor":cursor,"owner_id":snapshot["thread"]["owner_id"],"type":"message.updated","entity_kind":"message","entity_id":message["id"],"revision":message["revision"],"created_at":message["updated_at"],"data":message});
            let update=event(cursor+1,&message);
            projection.apply(EventPage{events:vec![update.clone(),update],next_cursor:cursor+1}).unwrap();
            assert_eq!(rows(projection.value(),"messages").len(),snapshot["messages"].as_array().unwrap().len());
            assert_eq!(projection.value()["messages"][0]["text"],"Updated 😀");
            let older=snapshot["messages"][0].clone();
            projection.apply(EventPage{events:vec![event(cursor+2,&older)],next_cursor:cursor+2}).unwrap();
            assert_eq!(projection.value()["messages"][0]["text"],"Updated 😀");
            message["revision"]=json!(3);message["state"]=json!("deleted");
            projection.apply(EventPage{events:vec![event(cursor+3,&message)],next_cursor:cursor+3}).unwrap();
            assert_eq!(projection.value()["messages"][0]["state"],"deleted");
            let mut unrelated=message.clone();unrelated["thread_id"]=json!(Uuid::nil());unrelated["revision"]=json!(4);
            let mut outside=event(cursor+4,&unrelated);outside["conversation_thread_id"]=json!(Uuid::nil());
            assert!(!projection.apply(EventPage{events:vec![outside],next_cursor:cursor+4}).unwrap());
            assert_eq!(projection.value()["messages"][0]["revision"],3);
            let before=projection.cursor();let invalid=event(cursor+6,&message);let other=event(cursor+5,&message);
            assert!(projection.apply(EventPage{events:vec![invalid,other],next_cursor:cursor+6}).is_err());assert_eq!(projection.cursor(),before);
        }).unwrap().join().unwrap();
    }
}

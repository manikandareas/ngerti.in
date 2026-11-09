//! Conversation-scoped presentation policy, adapted from conversation-activity.ts.
use ngertiin_client::{rows, text};
use serde_json::Value;

pub fn in_thread(activity: &Value, thread: &Value, agent: &str) -> bool {
    activity["thread_id"] == thread["id"] && activity["agent_id"] == agent
}

pub fn waiting(run: &Value, snapshot: &Value) -> bool {
    rows(run, "native_interactions").iter().any(|record| {
        record["observed_state"] == "pending" && record["submission"]["state"] != "submitted"
    }) || rows(snapshot, "human_requests")
        .iter()
        .any(|request| request["source_run_id"] == run["id"] && request["state"] == "pending")
}

pub fn visible(run: &Value, snapshot: &Value) -> bool {
    let status = text(run, "status");
    if !run["retried_by_run_id"].is_null()
        || matches!(status, "succeeded" | "steered") && !run["computer_activity"].is_object()
        || !rows(&snapshot["thread"], "member_agent_ids").contains(&run["agent_id"])
    {
        return false;
    }
    // An inline question/approval already explains why work has paused.
    if waiting(run, snapshot)
        && !matches!(
            status,
            "failed" | "unknown" | "cancel_requested" | "cancelled"
        )
    {
        return false;
    }
    if rows(snapshot, "tasks")
        .iter()
        .any(|task| task["current_run_id"] == run["id"] && task["state"] == "waiting_peer")
        && status == "running"
    {
        return false;
    }
    let reply = rows(snapshot, "human_requests").iter().any(|request| {
        request["state"] == "answered" && request["continuation_run_id"] == run["id"]
    });
    if run["publication"] != "immediate" && !reply && !run["computer_activity"].is_object() {
        return false;
    }
    if status == "queued" && run["retry_of_run_id"].is_null() {
        let handoff = rows(snapshot, "messages").iter().any(|message| {
            message["id"] == run["input_message_id"]
                && matches!(text(message, "purpose"), "handoff" | "review")
        });
        let busy = rows(snapshot, "runs").iter().any(|other| {
            other["agent_id"] == run["agent_id"]
                && matches!(
                    text(other, "status"),
                    "running" | "dispatching" | "cancel_requested" | "unknown"
                )
        });
        if !handoff
            && (run["preparation"].is_null() || run["preparation"]["state"] == "ready" || busy)
        {
            return false;
        }
    }
    true
}

pub fn label(run: &Value, online: bool, target: Option<&str>) -> String {
    if !online && !matches!(text(run, "status"), "unknown" | "failed" | "cancelled") {
        return "Reconnecting…".into();
    }
    if rows(run, "active_tools")
        .last()
        .is_some_and(|tool| tool["kind"] == "asking_agent")
        && run["status"] == "running"
        && let Some(target) = target
    {
        return format!("Asking @{target} for help…");
    }
    let label = match text(run, "status") {
        "unknown" => "The result needs a check.",
        "failed" => "I couldn’t finish this.",
        "cancelled" => "Stopped.",
        "cancel_requested" => "Stopping…",
        "queued" => match text(&run["preparation"], "state") {
            "blocked" => "I couldn’t get started.",
            "preparing" => "Getting ready…",
            "retrying" => "Reconnecting…",
            _ => "Waiting to start…",
        },
        "dispatching" => "Getting ready…",
        _ => match rows(run, "active_tools")
            .last()
            .map(|tool| text(tool, "kind"))
        {
            Some("searching") => "Searching the web…",
            Some("reading") => "Reading your file…",
            Some("updating") => "Updating your file…",
            Some("creating") => "Creating a file…",
            Some("browsing") => "Looking through a page…",
            Some("asking_agent") => "Asking for help…",
            Some(_) => "Working on it…",
            None if run["activity"] == "generating" => {
                let labels = [
                    "Thinking it through…",
                    "Connecting the dots…",
                    "Let me think for a sec…",
                    "Putting the pieces together…",
                    "A little brainwork…",
                ];
                let hash = text(run, "id").bytes().fold(2166136261_u32, |hash, byte| {
                    (hash ^ u32::from(byte)).wrapping_mul(16777619)
                });
                labels[hash as usize % labels.len()]
            }
            None => "Working on it…",
        },
    };
    label.into()
}

pub fn loading(run: &Value, online: bool) -> bool {
    online
        && (matches!(
            text(run, "status"),
            "running" | "dispatching" | "cancel_requested"
        ) || run["status"] == "queued"
            && matches!(text(&run["preparation"], "state"), "preparing" | "retrying"))
}

pub fn guidance(code: &str) -> &'static str {
    match code {
        "MODEL_UNAVAILABLE" => "Choose an available model to get started.",
        "LOGIN_REQUIRED" => "Sign in to get started.",
        "AUTH_REQUIRED" => "Connect your account to get started.",
        "AUTH_REJECTED" => "Your connection needs attention.",
        "CREDENTIAL_MISSING" => "Add your key in connection settings.",
        "EXECUTABLE_MISSING" => "Check your connection in settings.",
        "VERSION_TOO_OLD" => "Update your connected app to continue.",
        "VERSION_UNKNOWN" => "Check your connected app in settings.",
        "BILLING_MISMATCH" => "Check the billing option selected for this connection.",
        "NATIVE_REJECTED" => "Check your model and connection settings.",
        "CAPABILITY_UNSUPPORTED" => "This connection doesn’t support that action.",
        "CAPABILITY_UNKNOWN" => "Check whether your connection supports this action.",
        _ => "Please check your connection and try again.",
    }
}

/// Match the web client's stable routing copy without exposing internal routing data.
pub fn routing_label(route: &Value) -> &'static str {
    match text(route, "state") {
        "unknown" => "I couldn’t confirm who should reply.",
        "rejected" => "No member could start this request.",
        _ => match text(&route["execution"], "stage") {
            "reconcile" => "I couldn’t confirm who should reply.",
            "blocked" => "I couldn’t get started.",
            "preparing" => "Getting ready…",
            "retrying" => "Reconnecting…",
            _ => {
                let labels = [
                    "Who’s got this? One sec…",
                    "Who’s up? Let’s see…",
                    "Picking a brain to borrow…",
                    "Finding your partner in crime…",
                    "Who’s taking the mic?…",
                ];
                let hash = text(route, "id")
                    .bytes()
                    .fold(2166136261_u32, |hash, byte| {
                        (hash ^ u32::from(byte)).wrapping_mul(16777619)
                    });
                labels[hash as usize % labels.len()]
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shared_members_do_not_share_thread_activity() {
        let work = json!({"thread_id":"one","agent_id":"tobi"});
        assert!(in_thread(&work, &json!({"id":"one"}), "tobi"));
        assert!(!in_thread(&work, &json!({"id":"two"}), "tobi"));
        assert!(!in_thread(&work, &json!({"id":"one"}), "bianca"));
    }

    #[test]
    fn question_and_normal_queue_do_not_add_status_bubbles() {
        let mut run = json!({"id":"r","agent_id":"tobi","status":"running","publication":"immediate","native_interactions":[{"observed_state":"pending","submission":{"state":"submitted"}}]});
        let mut snapshot =
            json!({"thread":{"member_agent_ids":["tobi"]},"runs":[],"human_requests":[]});
        assert!(visible(&run, &snapshot));
        run["native_interactions"][0]["submission"] = Value::Null;
        assert!(!visible(&run, &snapshot));
        run["native_interactions"] = json!([]);
        snapshot["human_requests"] = json!([{"source_run_id":"r","state":"pending"}]);
        assert!(!visible(&run, &snapshot));
        snapshot["human_requests"] = json!([]);
        run["status"] = json!("queued");
        assert!(!visible(&run, &snapshot));
        run["preparation"] = json!({"state":"blocked"});
        assert!(visible(&run, &snapshot));
        run["publication"] = json!("quiet");
        assert!(!visible(&run, &snapshot));
    }
}

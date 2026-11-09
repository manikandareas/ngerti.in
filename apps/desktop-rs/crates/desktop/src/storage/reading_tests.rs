use super::{ReadingPosition, Store};
use crate::models::composer::{Draft, Reference, ReferenceKind, Snapshot};
use uuid::Uuid;

#[test]
fn rich_drafts_and_reading_anchors_survive_profile_restart_and_exact_cleanup() {
    let root = std::env::temp_dir().join(format!("ngertiin-reading-{}", Uuid::new_v4()));
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let mut draft = Draft::reference(Reference {
        kind: ReferenceKind::File,
        id: Uuid::new_v4().to_string(),
        label: "Notes 中文 😀.md".into(),
        source: None,
        agent_id: None,
        version: None,
    })
    .unwrap();
    draft.text.push_str(" more");
    let snapshot = Snapshot {
        selection: draft.text.len() - 4..draft.text.len(),
        draft,
        reversed: true,
    };
    let position = ReadingPosition {
        row: format!("message:{}:0", Uuid::new_v4()),
        sequence: Some(112),
        offset: 2.5,
        following: false,
    };
    let mut store = Store::open(root.clone()).unwrap();
    store.select(a).unwrap();
    store.save_composer(a, snapshot.clone()).unwrap();
    store.save_draft(b, "Keep B".into()).unwrap();
    store.save_reading_position(a, position.clone()).unwrap();
    drop(store);
    let mut store = Store::open(root.clone()).unwrap();
    assert_eq!(store.selected(), Some(a));
    assert_eq!(store.composer(a), Some(snapshot.clone()));
    assert_eq!(store.reading_position(a), Some(position.clone()));
    let op = store
        .submission(a, Some(Uuid::new_v4()), false, snapshot.draft.text)
        .unwrap();
    store.clear_sent(&op).unwrap();
    drop(store);
    let store = Store::open(root.clone()).unwrap();
    assert!(store.composer(a).is_none());
    assert!(store.draft(a).is_empty());
    assert_eq!(store.draft(b), "Keep B");
    assert_eq!(store.reading_position(a), Some(position));
    drop(store);
    std::fs::remove_dir_all(root).unwrap();
}

//! Controlled roving keyboard selection for native tab groups.
pub fn navigation_target(index: usize, count: usize, key: &str) -> Option<usize> {
    if count == 0 || index >= count {
        return None;
    }
    match key {
        "right" | "down" => Some((index + 1) % count),
        "left" | "up" => Some((index + count - 1) % count),
        "home" => Some(0),
        "end" => Some(count - 1),
        _ => None,
    }
}

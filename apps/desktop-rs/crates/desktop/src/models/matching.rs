//! Small deterministic fuzzy ranking for already-authorized native catalogs.
pub fn score(query: &str, label: &str) -> Option<usize> {
    let query = query.to_lowercase();
    let label = label.to_lowercase();
    if query.is_empty() {
        return Some(0);
    }
    if let Some(start) = label.find(&query) {
        return Some(start);
    }
    let mut cursor = 0;
    let mut gaps = 0;
    for ch in query.chars() {
        let found = label[cursor..].find(ch)?;
        gaps += found;
        cursor += found + ch.len_utf8();
    }
    Some(1000 + gaps)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranks_contiguous_matches_before_subsequences_and_handles_unicode() {
        assert!(score("read", "README.md") < score("read", "really extended agent document"));
        assert!(score("rdm", "README.md").is_some());
        assert!(score("é", "Café").is_some());
        assert_eq!(score("missing", "README.md"), None);
    }
}

//! Native external navigation follows the reference host's protocol policy.
pub(crate) fn is_external_url(value: &str) -> bool {
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return false;
    }
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.username().is_empty()
        && url.password().is_none()
        && (url.scheme() == "https"
            || url.scheme() == "http"
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_safe_external_navigation_reaches_the_os_browser() {
        for url in [
            "https://example.com/report",
            "http://127.0.0.1:3000/callback",
            "http://[::1]:3000/",
        ] {
            assert!(is_external_url(url));
        }
        for url in [
            "file:///tmp/report",
            "javascript:alert(1)",
            "https://user:secret@example.com",
            "http://example.com",
            "https://example.com/\n",
        ] {
            assert!(!is_external_url(url));
        }
    }
}

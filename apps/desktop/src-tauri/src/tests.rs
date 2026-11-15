use crate::gateway;
use axum::{body::Body, http::StatusCode};

#[tokio::test]
async fn browser_handoff_validates_origin_payload_and_reports_os_failure() {
    use axum::http::Request;
    let origin = "http://127.0.0.1:4315";
    for (method, supplied_origin, content_type, body, expected) in [
        (
            "GET",
            origin,
            "application/json",
            r#"{"url":"https://provider.test/approve"}"#,
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        (
            "POST",
            "https://foreign.test",
            "application/json",
            r#"{"url":"https://provider.test/approve"}"#,
            StatusCode::FORBIDDEN,
        ),
        (
            "POST",
            "",
            "application/json",
            r#"{"url":"https://provider.test/approve"}"#,
            StatusCode::FORBIDDEN,
        ),
        (
            "POST",
            origin,
            "text/plain",
            r#"{"url":"https://provider.test/approve"}"#,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        ),
        (
            "POST",
            origin,
            "application/json",
            r#"{"url":"file:///private/data"}"#,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            origin,
            "application/json",
            r#"{"url":"http://provider.test/approve"}"#,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            origin,
            "application/json",
            r#"{"url":"https://user:pass@provider.test/approve"}"#,
            StatusCode::BAD_REQUEST,
        ),
        (
            "POST",
            origin,
            "application/json",
            r#"{"url":"https://provider.test/approve","command":"no"}"#,
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let request = Request::builder()
            .method(method)
            .header("Origin", supplied_origin)
            .header("Content-Type", content_type)
            .body(Body::from(body))
            .unwrap();
        let response = gateway::open_external(request, origin, |_| {
            panic!("Invalid handoff reached OS opener")
        })
        .await;
        assert_eq!(response.status(), expected);
    }
    let request = || {
        Request::builder()
            .method("POST")
            .header("Origin", origin)
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"url":"https://provider.test/approve"}"#))
            .unwrap()
    };
    let response = gateway::open_external(request(), origin, |url| {
        assert_eq!(url, "https://provider.test/approve");
        Ok(())
    })
    .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let response = gateway::open_external(request(), origin, |_| {
        Err(std::io::Error::other("private OS detail"))
    })
    .await;
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let text = String::from_utf8(body.to_vec()).unwrap();
    assert!(text.contains("BROWSER_UNAVAILABLE"));
    assert!(!text.contains("private OS detail"));
    assert!(!text.contains("provider.test"));
}

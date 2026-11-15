use super::*;
fn metadata() -> Metadata {
    Metadata {
        client_id: "ngertiin-tauri".into(),
        issuer: "https://workspace.test/api/auth".into(),
        audience: "https://workspace.test".into(),
        authorization_endpoint: "https://workspace.test/api/auth/oauth2/authorize".into(),
        token_endpoint: "https://workspace.test/api/auth/oauth2/token".into(),
        redirect_uri: "http://127.0.0.1:43119/callback".into(),
    }
}
fn callback(flow: &Flow) -> String {
    format!(
        "{}?state={}&iss=https%3A%2F%2Fworkspace.test%2Fapi%2Fauth&code=one-use-code",
        flow.metadata.redirect_uri, flow.state
    )
}
#[test]
fn callback_is_origin_state_issuer_deadline_and_one_use_bound() {
    let mut flow = Flow::new(metadata()).unwrap();
    let valid = callback(&flow);
    for invalid in [
        valid.replace("43119", "43120"),
        valid.replace("/callback?", "/other?"),
        valid.replace("state=", "state=wrong"),
        format!("{valid}&state=duplicate"),
        format!("{valid}&code=duplicate"),
        format!("{valid}&iss=duplicate"),
        format!("{valid}&error=denied"),
        format!("{valid}#fragment"),
        valid.replace("workspace.test", "foreign.test"),
    ] {
        assert!(flow.exchange(&invalid).is_err());
    }
    let form = flow.exchange(&valid).unwrap();
    assert!(
        form.iter()
            .any(|(name, value)| name == "code_verifier" && value.len() == 43)
    );
    assert!(flow.exchange(&valid).is_err());
    let mut late = Flow::new(metadata()).unwrap();
    late.deadline = Instant::now();
    assert!(late.exchange(&callback(&late)).is_err());
}
#[test]
fn metadata_never_selects_another_issuer_endpoint_or_callback_host() {
    let mut value = metadata();
    value.validate("https://workspace.test").unwrap();
    value.token_endpoint = "https://foreign.test/token".into();
    assert!(value.validate("https://workspace.test").is_err());
    let mut value = metadata();
    value.redirect_uri = "http://localhost:43119/callback".into();
    assert!(value.validate("https://workspace.test").is_err());
    let flow = Flow::new(metadata()).unwrap();
    let url = url::Url::parse(&flow.authorize()).unwrap();
    assert!(
        url.query_pairs()
            .any(|(key, value)| key == "code_challenge_method" && value == "S256")
    );
    assert!(
        !url.query_pairs()
            .any(|(key, _)| key == "code_verifier" || key == "client_secret")
    );
}
#[tokio::test]
async fn listener_ignores_invalid_requests_then_closes_after_one_callback() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mut value = metadata();
    value.redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let mut flow = Flow::new(value).unwrap();
    let valid = callback(&flow);
    let task = tokio::spawn(async move { flow.listen(listener, CancellationToken::new()).await });
    let client = reqwest::Client::new();
    assert_eq!(
        client
            .get(format!("http://127.0.0.1:{port}/callback?state=wrong"))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(client.get(valid).send().await.unwrap().status(), 200);
    assert!(task.await.unwrap().is_ok());
    assert!(
        TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
            .await
            .is_ok()
    );
}

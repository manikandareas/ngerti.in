use ngertiin_client::{ClientError, ReadOnlyClient, check_contract, decode_snapshot};
use serde_json::Value;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{Arc, Mutex},
    thread,
};

const CONTRACT: &[u8] = include_bytes!("../../../../../docs/contracts/1.31.0.json");
const SNAPSHOT: &[u8] = include_bytes!("../../../verification/snapshot.json");

#[test]
fn original_content_is_byte_identical_and_redirects_are_not_followed() {
    let original: Vec<u8> = (0..=255).cycle().take(4096).collect();
    let (origin, requests, handle) = server(vec![
        (
            200,
            original.clone(),
            "Content-Type: application/octet-stream\r\n",
        ),
        (302, vec![], "Location: https://example.com/\r\n"),
    ]);
    let client = ngertiin_client::ApiClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.bytes("/v1/machine/file?path=report.csv").unwrap(),
        original
    );
    assert_eq!(
        client.bytes("/v1/machine/file?path=redirect").unwrap_err(),
        ClientError::Http(302)
    );
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap().len(), 2);
    assert_eq!(
        client.bytes("https://example.com/private").unwrap_err(),
        ClientError::InvalidConnection
    );
    assert_eq!(
        client.bytes("/v1/entities/agent").unwrap_err(),
        ClientError::InvalidConnection
    );
}

fn server(
    responses: Vec<(u16, Vec<u8>, &'static str)>,
) -> (String, Arc<Mutex<Vec<String>>>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}/", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    let handle = thread::spawn(move || {
        for (status, body, extra) in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            let mut request = vec![];
            loop {
                let mut buffer = [0; 2048];
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(request).unwrap();
            assert!(
                request
                    .to_lowercase()
                    .contains("authorization: bearer fixture-token")
            );
            recorded
                .lock()
                .unwrap()
                .push(request.lines().next().unwrap().into());
            write!(
                stream,
                "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
                body.len()
            )
            .unwrap();
            let _ = stream.write_all(&body);
        }
    });
    (origin, requests, handle)
}

#[test]
fn pinned_contract_and_current_fixture_decode() {
    check_contract(CONTRACT).unwrap();
    let snapshot = decode_snapshot(SNAPSHOT).unwrap();
    assert!(snapshot.cursor > 0);
    assert_eq!(snapshot.agents.len(), 1);
}

#[test]
fn malformed_and_shape_errors_are_distinct() {
    assert_eq!(decode_snapshot(b"{").unwrap_err(), ClientError::Malformed);
    let mut value: Value = serde_json::from_slice(SNAPSHOT).unwrap();
    value.as_object_mut().unwrap().remove("timeline");
    assert_eq!(
        decode_snapshot(&serde_json::to_vec(&value).unwrap()).unwrap_err(),
        ClientError::ShapeMismatch
    );
    value["cursor"] = (-1).into();
    assert!(decode_snapshot(&serde_json::to_vec(&value).unwrap()).is_err());
}

#[test]
fn same_version_changed_schema_is_rejected() {
    let mut contract: Value = serde_json::from_slice(CONTRACT).unwrap();
    contract["projections"]["conversation"]["required"] = serde_json::json!([]);
    assert_eq!(
        check_contract(&serde_json::to_vec(&contract).unwrap()),
        Err(ClientError::ShapeMismatch)
    );
    contract["version"] = "2.0.0".into();
    assert_eq!(
        check_contract(&serde_json::to_vec(&contract).unwrap()),
        Err(ClientError::VersionMismatch)
    );
}

#[test]
fn only_two_gets_open_an_existing_thread() {
    let snapshot = decode_snapshot(SNAPSHOT).unwrap();
    let (origin, requests, handle) =
        server(vec![(200, CONTRACT.into(), ""), (200, SNAPSHOT.into(), "")]);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.snapshot(snapshot.thread.id).unwrap().cursor,
        snapshot.cursor
    );
    handle.join().unwrap();
    assert_eq!(
        *requests.lock().unwrap(),
        [
            "GET /v1/contracts HTTP/1.1",
            &format!("GET /v1/threads/{}/snapshot HTTP/1.1", snapshot.thread.id)
        ]
    );
}

#[test]
fn wrong_thread_is_rejected() {
    let (origin, _, handle) = server(vec![(200, CONTRACT.into(), ""), (200, SNAPSHOT.into(), "")]);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.snapshot(uuid::Uuid::nil()).unwrap_err(),
        ClientError::WrongThread
    );
    handle.join().unwrap();
}

#[test]
fn authentication_and_http_errors_do_not_read_snapshot() {
    for (status, expected) in [
        (401, ClientError::Unauthorized),
        (403, ClientError::Unauthorized),
        (503, ClientError::Http(503)),
    ] {
        let (origin, requests, handle) = server(vec![(status, vec![], "")]);
        let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
        assert_eq!(client.snapshot(uuid::Uuid::nil()).unwrap_err(), expected);
        handle.join().unwrap();
        assert_eq!(requests.lock().unwrap().len(), 1);
    }
}

#[test]
fn redirects_are_not_followed_with_installation_credentials() {
    let (origin, requests, handle) = server(vec![(
        302,
        vec![],
        "Location: http://127.0.0.1:1/private\r\n",
    )]);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.snapshot(uuid::Uuid::nil()).unwrap_err(),
        ClientError::Http(302)
    );
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap().len(), 1);
}

#[test]
fn unavailable_connection_is_actionable() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}/", listener.local_addr().unwrap());
    drop(listener);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    let error = client.snapshot(uuid::Uuid::nil()).unwrap_err();
    assert_eq!(error, ClientError::Unavailable);
    assert!(error.to_string().contains("retry"));
}

#[test]
fn origin_and_credential_boundaries_are_explicit() {
    for origin in [
        "https://127.0.0.1/",
        "http://example.com/",
        "http://127.0.0.1/path",
        "http://name@127.0.0.1/",
        "http://127.0.0.1/?token=secret",
        "http://127.0.0.1/#secret",
    ] {
        assert!(matches!(
            ReadOnlyClient::new(origin, "fixture-token".into()),
            Err(ClientError::InvalidConnection)
        ));
    }
    assert!(ReadOnlyClient::new("http://127.0.0.1/", "secret\nvalue".into()).is_err());
}

#[test]
fn oversized_response_is_rejected_before_decoding() {
    let (origin, _, handle) = server(vec![(200, vec![b' '; 16 * 1024 * 1024 + 1], "")]);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.snapshot(uuid::Uuid::nil()).unwrap_err(),
        ClientError::TooLarge
    );
    handle.join().unwrap();
}

#[test]
fn incompatible_contract_never_requests_a_snapshot() {
    let (origin, requests, handle) = server(vec![(200, br#"{"version":"9.0.0"}"#.into(), "")]);
    let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
    assert_eq!(
        client.snapshot(uuid::Uuid::nil()).unwrap_err(),
        ClientError::VersionMismatch
    );
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap().len(), 1);
}

use ngertiin_client::{ReadOnlyClient, SnapshotWorker};
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

/// Runs in its own test process so schema compilation is cold. macOS GPUI's
/// dispatch workers have small stacks; a normal Rust test thread hid this fault.
#[test]
fn cold_snapshot_decoding_from_a_small_stack_caller() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}/", listener.local_addr().unwrap());
    let snapshot = include_bytes!("../../../verification/snapshot.json");
    let contract = include_bytes!("../../../../../docs/contracts/1.32.0.json");
    let thread_id = serde_json::from_slice::<serde_json::Value>(snapshot).unwrap()["thread"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    let server = thread::spawn(move || {
        for body in [contract.as_slice(), snapshot.as_slice()] {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            let mut request = Vec::new();
            while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                let mut buffer = [0; 2048];
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0 && request.len() + count <= 8192);
                request.extend_from_slice(&buffer[..count]);
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
        }
    });
    thread::Builder::new()
        .stack_size(256 * 1024)
        .spawn(move || {
            let worker = SnapshotWorker::new().unwrap();
            let client = ReadOnlyClient::new(&origin, "fixture-token".into()).unwrap();
            let result = futures_executor::block_on(worker.read(client, thread_id).unwrap())
                .unwrap()
                .unwrap();
            assert_eq!(result.thread.id, thread_id);
        })
        .unwrap()
        .join()
        .unwrap();
    server.join().unwrap();
}

//! Loopback-only static fixture server. It has no workspace API or credential access.
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    time::Duration,
};

pub fn start(root: PathBuf) -> anyhow::Result<String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let origin = format!("http://{}", listener.local_addr()?);
    println!("Experiment reference: {origin}");
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let root = root.clone();
            std::thread::spawn(move || {
                let _ = respond(stream, root);
            });
        }
    });
    Ok(origin)
}

fn respond(mut stream: TcpStream, root: PathBuf) -> anyhow::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    let mut bytes = [0; 8192];
    let count = stream.read(&mut bytes)?;
    let request = String::from_utf8_lossy(&bytes[..count]);
    let mut first = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace();
    let method = first.next().unwrap_or_default();
    let path = first.next().unwrap_or("/").split('?').next().unwrap_or("/");
    let path = path.trim_start_matches('/');
    let (status, mime, body) = if method != "GET"
        || path.contains("..")
        || path.contains('%')
        || path.contains('\\')
    {
        (
            "400 Bad Request",
            "text/plain",
            b"Invalid fixture request".to_vec(),
        )
    } else if path == "preview.html" {
        (
            "200 OK",
            "text/html; charset=utf-8",
            include_bytes!("../fixtures/preview.html").to_vec(),
        )
    } else if path == "computer.html" {
        ("200 OK","text/html; charset=utf-8",b"<!doctype html><html><body style='background:#121212;color:#f5f5f5;font:14px system-ui;display:grid;place-content:center;height:90vh;text-align:center'><h2>Computer viewer</h2><p>No live Cua viewer connected.</p><p>Launch with NGERTIIN_GPUI_COMPUTER_URL to test an existing read-only viewer.</p><p>This surface is a real embedded WebView, not a simulated desktop.</p></body></html>".to_vec())
    } else {
        let relative = if path.is_empty() { "index.html" } else { path };
        let file = if path.starts_with("assets/")
            && root.join(path.trim_start_matches("assets/")).is_file()
        {
            root.join(path.trim_start_matches("assets/"))
        } else {
            root.join("reference").join(relative)
        };
        match std::fs::read(&file) {
            Ok(body) => (
                "200 OK",
                match file
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                {
                    "html" => "text/html; charset=utf-8",
                    "js" => "text/javascript",
                    "css" => "text/css",
                    "png" => "image/png",
                    "svg" => "image/svg+xml",
                    "woff2" => "font/woff2",
                    _ => "application/octet-stream",
                },
                body,
            ),
            Err(_) => (
                "404 Not Found",
                "text/plain",
                b"Fixture not found. Run bun run prepare.".to_vec(),
            ),
        }
    };
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n",
        body.len()
    )?;
    stream.write_all(&body)?;
    Ok(())
}

//! The only WebView construction seam: static documents and ticket-scoped Computer media.
//! Neither surface receives installation credentials or a generic native bridge.
use gpui_kit::*;
use gpui_webview::WebView;

pub fn static_document(
    prepared_html: crate::models::html::PreparedHtml,
    window: &mut Window,
    cx: &mut App,
) -> wry::Result<WebView> {
    WebView::build(
        wry::WebViewBuilder::new()
            .with_devtools(false)
            .with_incognito(true)
            .with_javascript_disabled()
            .with_navigation_handler(|url| url == "about:blank" || url.starts_with("about:blank#"))
            .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
            .with_download_started_handler(|_, _| false)
            .with_html(prepared_html.into_string()),
        window,
        cx,
    )
}

/// The viewer receives only its scoped capability URL. Its IPC is a one-way,
/// bounded media-health report, validated against this exact main-frame URL.
pub(crate) fn computer(
    url: &str,
    viewer_id: &str,
    health: std::sync::Arc<std::sync::Mutex<ComputerHealth>>,
    window: &mut Window,
    cx: &mut App,
) -> anyhow::Result<WebView> {
    let parsed = url::Url::parse(url)?;
    let prefix = format!("/v1/machine/viewer/{viewer_id}/");
    anyhow::ensure!(
        parsed.scheme() == "http"
            && parsed.host_str() == Some("127.0.0.1")
            && parsed.path() == format!("{prefix}viewer/")
            && viewer_id.len() == 64
            && viewer_id.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid Computer surface"
    );
    let origin = parsed.origin().ascii_serialization();
    let navigation = parsed.clone();
    let message_url = parsed.clone();
    let expected_id = viewer_id.to_string();
    let script = format!(
        r#"(()=>{{
        const expected={}; const origin={};
        addEventListener('message',event=>{{
            if(event.source!==window || event.origin!==origin || event.data?.type!=='ngertiin:computer-health' || event.data.viewer_id!==expected) return;
            window.ipc.postMessage(JSON.stringify({{viewer_id:expected,status:String(event.data.status).slice(0,32),frames_decoded:Number(event.data.frames_decoded)||0}}));
        }});
    }})();"#,
        serde_json::to_string(viewer_id)?,
        serde_json::to_string(&origin)?
    );
    let view = WebView::build(
        wry::WebViewBuilder::new()
            .with_incognito(true)
            .with_devtools(cfg!(debug_assertions))
            .with_initialization_script(script)
            .with_navigation_handler(move |target| {
                url::Url::parse(&target).is_ok_and(|u| {
                    u.origin() == navigation.origin()
                        && u.path() == navigation.path()
                        && u.query().is_none()
                })
            })
            .with_new_window_req_handler(|_, _| wry::NewWindowResponse::Deny)
            .with_download_started_handler(|_, _| false)
            .with_ipc_handler(move |request| {
                if request.body().len() > 512 {
                    return;
                }
                let Ok(source) = url::Url::parse(&request.uri().to_string()) else {
                    return;
                };
                if source.origin() != message_url.origin() || source.path() != message_url.path() {
                    return;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(request.body()) else {
                    return;
                };
                if value["viewer_id"] != expected_id {
                    return;
                }
                let Some(frames) = value["frames_decoded"].as_u64() else {
                    return;
                };
                let Some(status) = value["status"].as_str() else {
                    return;
                };
                if ![
                    "connecting",
                    "streaming",
                    "failed",
                    "disconnected",
                    "closed",
                ]
                .contains(&status)
                {
                    return;
                }
                *health.lock().unwrap() = ComputerHealth {
                    frames,
                    status: status.into(),
                    received: std::time::Instant::now(),
                };
            })
            .with_url(url),
        window,
        cx,
    )?;
    #[cfg(target_os = "macos")]
    {
        use wry::WebViewExtMacOS as _;
        let native = view.webview();
        native.setWantsLayer(true);
        if let Some(layer) = native.layer() {
            layer.setCornerRadius(f64::from(window.rem_size()) * 0.75);
            layer.setMasksToBounds(true);
        }
    }
    Ok(view)
}
pub(crate) struct ComputerHealth {
    pub frames: u64,
    pub status: String,
    pub received: std::time::Instant,
}
impl Default for ComputerHealth {
    fn default() -> Self {
        Self {
            frames: 0,
            status: "connecting".into(),
            received: std::time::Instant::now(),
        }
    }
}

/// Reassert native visibility during prepaint. AppKit may show child surfaces
/// again when a minimized window returns, including a covered compact viewer.
pub(crate) fn computer_surface(view: &Entity<WebView>, visible: bool) -> AnyElement {
    let surface = view.clone();
    div()
        .relative()
        .size_full()
        .child(
            canvas(
                move |_, _, cx| {
                    surface.update(cx, |view, _| {
                        let _ = view.set_visible(visible);
                    })
                },
                |_, _, _, _| {},
            )
            .absolute()
            .inset_0(),
        )
        .child(view.clone())
        .into_any_element()
}

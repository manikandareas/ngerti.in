//! The only WebView construction seam: isolated static document content.
//! No native IPC, scripts, credentials, navigation, downloads or persistent store.
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

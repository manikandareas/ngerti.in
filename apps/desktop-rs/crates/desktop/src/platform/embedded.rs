//! The only WebView construction seam. Only a trusted static proof is mounted here.
//! Arbitrary document sanitization and live ticket sessions belong to later milestones.
use gpui_kit::*;
use gpui_webview::WebView;

pub fn html_probe(window: &mut Window, cx: &mut App) -> wry::Result<WebView> {
    WebView::build(wry::WebViewBuilder::new()
        .with_devtools(false)
        .with_navigation_handler(|url| url == "about:blank")
        .with_html(concat!(
            "<!doctype html><meta charset='utf-8'>",
            "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; script-src 'none'; navigate-to 'none'\">",
            "<style>body{font:18px system-ui;background:#f5f5f5;color:#1c1c1c;padding:40px}h1{font-size:30px}a{color:#0b5cb8}</style>",
            "<h1>Static HTML document</h1><p>Select this document text. Open the native overlay above it.</p>",
            "<p><a href='https://example.com'>Blocked external navigation</a></p>",
            "<script>document.body.textContent='SCRIPT EXECUTED: FAIL'</script>"
        )), window, cx)
}

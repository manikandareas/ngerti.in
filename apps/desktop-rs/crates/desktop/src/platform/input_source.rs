//! Development-gallery access to the focused AppKit text context's enabled
//! input sources. This is not a global shortcut or event-synthesis bridge.
use objc2::MainThreadMarker;
use objc2_app_kit::NSTextInputContext;

pub fn next_enabled() -> Result<String, String> {
    let main = MainThreadMarker::new().ok_or("Native input sources require the main thread.")?;
    let context = NSTextInputContext::currentInputContext(main)
        .ok_or("Focus the composer, then select an input source again.")?;
    context.activate();
    let sources = context
        .keyboardInputSources()
        .ok_or("The current text context has no enabled input sources.")?;
    if sources.len() < 2 {
        return Err(
            "Enable a second input source in macOS Keyboard settings to test composition.".into(),
        );
    }
    let current = context.selectedKeyboardInputSource();
    let index = sources
        .iter()
        .position(|s| current.as_ref().is_some_and(|c| **c == *s));
    let next = sources.objectAtIndex(index.map_or(0, |i| (i + 1) % sources.len()));
    context.setSelectedKeyboardInputSource(Some(&next));
    let selected = context.selectedKeyboardInputSource();
    if selected.as_ref().is_none_or(|s| **s != *next) {
        return Err(
            "macOS did not select the requested input source. Retry with the composer focused."
                .into(),
        );
    }
    let name = NSTextInputContext::localizedNameForInputSource(&next, main)
        .map_or_else(|| next.to_string(), |name| name.to_string());
    Ok(format!("Native composer input source: {name}"))
}

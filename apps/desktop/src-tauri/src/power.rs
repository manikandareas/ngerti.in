#[cfg(target_os = "macos")]
mod macos {
    use block2::RcBlock;
    use objc2::{Message, rc::Retained, runtime::ProtocolObject};
    use objc2_app_kit::{
        NSApplicationDidHideNotification, NSApplicationDidUnhideNotification,
        NSWindowDidDeminiaturizeNotification, NSWindowDidMiniaturizeNotification, NSWorkspace,
        NSWorkspaceDidWakeNotification, NSWorkspaceWillSleepNotification,
    };
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol, NSString};
    use std::{cell::RefCell, ptr::NonNull};
    use tauri::Manager;

    type Observer = (
        Retained<NSNotificationCenter>,
        Retained<ProtocolObject<dyn NSObjectProtocol>>,
    );
    thread_local! { static OBSERVERS: RefCell<Vec<Observer>> = const { RefCell::new(Vec::new()) }; }

    pub fn observe(app: &tauri::AppHandle) {
        let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
        let center = NSNotificationCenter::defaultCenter();
        unsafe {
            add(
                app,
                &workspace,
                NSWorkspaceWillSleepNotification,
                false,
                None,
            );
            add(app, &workspace, NSWorkspaceDidWakeNotification, true, None);
            add(app, &center, NSApplicationDidHideNotification, false, None);
            add(app, &center, NSApplicationDidUnhideNotification, true, None);
            if let Some(window) = app
                .get_webview_window("main")
                .and_then(|w| w.ns_window().ok())
            {
                let object = &*window.cast::<objc2::runtime::AnyObject>();
                add(
                    app,
                    &center,
                    NSWindowDidMiniaturizeNotification,
                    false,
                    Some(object),
                );
                add(
                    app,
                    &center,
                    NSWindowDidDeminiaturizeNotification,
                    true,
                    Some(object),
                );
            }
        }
    }

    fn add(
        app: &tauri::AppHandle,
        center: &NSNotificationCenter,
        name: &NSString,
        visible: bool,
        object: Option<&objc2::runtime::AnyObject>,
    ) {
        let app = app.clone();
        let callback = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let is_visible = visible
                    && handle.get_webview_window("main").is_some_and(|w| {
                        w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(true)
                    });
                crate::host::visibility(&handle, is_visible);
                if is_visible && let Some(host) = handle.try_state::<crate::host::Host>() {
                    let supervisor = host.supervisor.clone();
                    tauri::async_runtime::spawn(async move {
                        supervisor.check().await;
                    });
                }
            });
        });
        // AppHandle is Send + Sync; the center retains the block until its observer is removed.
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(Some(name), object, None, &callback)
        };
        OBSERVERS.with(|observers| observers.borrow_mut().push((center.retain(), observer)));
    }

    pub fn clear() {
        OBSERVERS.with(|observers| {
            for (center, observer) in observers.borrow_mut().drain(..) {
                unsafe {
                    center.removeObserver(AsRef::<objc2::runtime::AnyObject>::as_ref(&*observer));
                }
            }
        });
    }
}

pub fn observe(app: &tauri::AppHandle) -> anyhow::Result<()> {
    #[cfg(target_os = "macos")]
    macos::observe(app);
    Ok(())
}

pub fn clear() {
    #[cfg(target_os = "macos")]
    macos::clear();
}

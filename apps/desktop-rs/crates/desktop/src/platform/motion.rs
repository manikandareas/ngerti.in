//! Read macOS motion preference and forward notifications through a Send channel.
//! Native notification blocks never capture GPUI's main-thread application state.
use futures_util::StreamExt;
use gpui_kit::*;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{NSWorkspace, NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol, NSOperationQueue};
use std::ptr::NonNull;

struct MotionObserver {
    center: Retained<NSNotificationCenter>,
    token: Retained<ProtocolObject<dyn NSObjectProtocol>>,
    _task: Task<()>,
}
impl Global for MotionObserver {}
impl Drop for MotionObserver {
    fn drop(&mut self) {
        // SAFETY: this exact retained observer token belongs to this center.
        unsafe {
            self.center
                .removeObserver(AsRef::<objc2::runtime::AnyObject>::as_ref(&*self.token));
        }
    }
}
pub fn bind(cx: &mut App) {
    cx.set_reduce_motion(NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion());
    let (sender, mut receiver) = futures_channel::mpsc::unbounded::<bool>();
    let block = block2::RcBlock::new(move |_: NonNull<NSNotification>| {
        let _ = sender.unbounded_send(
            NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion(),
        );
    });
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: the block captures only a Send channel. AppKit invokes it on the
    // explicit main operation queue; GPUI updates occur in the receiver task.
    let token = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    let task = cx.spawn(async move |cx| {
        while let Some(reduce) = receiver.next().await {
            cx.update(|cx| cx.set_reduce_motion(reduce));
        }
    });
    cx.set_global(MotionObserver {
        center,
        token,
        _task: task,
    });
}

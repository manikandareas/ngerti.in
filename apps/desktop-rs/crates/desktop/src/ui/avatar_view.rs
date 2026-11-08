//! One display-synchronized clock and one bounded compositor per native window.
use super::avatar::{AvatarRenderer, FrameInput, FrameMetrics};
use gpui_kit::*;
use ngertiin_avatar::*;
use std::{
    cell::Cell,
    collections::VecDeque,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

pub struct AvatarAnimator {
    renderer: Option<AvatarRenderer>,
    entries: Vec<WeakEntity<AvatarPortrait>>,
    started: Instant,
    scheduled: bool,
    pending: bool,
    task: Option<Task<()>>,
    _visibility: Subscription,
    pub metrics: VecDeque<FrameMetrics>,
    pub presented: u64,
    pub deliveries_ms: VecDeque<f64>,
    pub visibility_changes: VecDeque<(f64, bool)>,
    pub visibility_truncated: bool,
    pointer: Option<Point<Pixels>>,
}
impl AvatarAnimator {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let visibility = cx.observe_window_visibility(window, |this, visibility, window, cx| {
            if this.visibility_changes.len() == 256 {
                this.visibility_truncated = true;
                this.visibility_changes.pop_front();
            }
            this.visibility_changes
                .push_back((this.now(), visibility.is_visible()));
            if !visibility.is_visible() {
                this.pointer = None;
                this.task = None;
                this.pending = false;
                this.scheduled = false;
                for entry in &this.entries {
                    let _ = entry.update(cx, |avatar, _| {
                        avatar.visible.store(false, Ordering::Relaxed);
                        avatar.motion.look_at(None);
                        avatar.dirty = true;
                    });
                }
            } else {
                for entry in &this.entries {
                    let _ = entry.update(cx, |avatar, cx| {
                        avatar.dirty = true;
                        cx.notify();
                    });
                }
                this.schedule(window, cx);
            }
        });
        Self {
            renderer: AvatarRenderer::new().ok(),
            entries: vec![],
            started: Instant::now(),
            scheduled: false,
            pending: false,
            task: None,
            _visibility: visibility,
            metrics: VecDeque::with_capacity(8192),
            presented: 0,
            deliveries_ms: VecDeque::with_capacity(8192),
            visibility_changes: VecDeque::with_capacity(256),
            visibility_truncated: false,
            pointer: None,
        }
    }
    pub fn look_at(
        &mut self,
        pointer: Option<Point<Pixels>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.pointer = pointer;
        for entry in &self.entries {
            let _ = entry.update(cx, |avatar, cx| {
                if avatar.visible.load(Ordering::Relaxed) {
                    avatar.dirty = true;
                    cx.notify();
                }
            });
        }
        self.schedule(window, cx);
    }
    pub fn now(&self) -> f64 {
        self.started.elapsed().as_secs_f64() * 1000.
    }
    pub fn schedule(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.scheduled || !window.is_visible() {
            return;
        }
        self.scheduled = true;
        let view = cx.entity().downgrade();
        window.on_next_frame(move |window, cx| {
            let _ = view.update(cx, |this, cx| this.tick(window, cx));
        });
    }
    fn tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.scheduled = false;
        if !window.is_visible() {
            return;
        }
        if self.pending {
            self.schedule(window, cx);
            return;
        }
        let now = self.now();
        let reduce = cx.reduce_motion();
        let scale = window.scale_factor();
        self.entries.retain(|entry| entry.upgrade().is_some());
        let mut inputs = vec![];
        let mut targets = vec![];
        for entry in &self.entries {
            let result = entry.update(cx, |avatar, _| {
                let visible = avatar.visible.load(Ordering::Relaxed);
                let reduced = reduce || avatar.reduced;
                if !visible {
                    avatar.motion.sample(
                        now,
                        seed_hash(&avatar.config.seed),
                        avatar.state,
                        false,
                        reduced,
                        avatar.size < 48.,
                    );
                    return None;
                }
                if reduced && !avatar.dirty && avatar.last_reduced == reduced {
                    return None;
                }
                let gaze = self.pointer.filter(|_| !reduced).map(|pointer| {
                    let bounds = avatar.bounds.get();
                    let reach = (f32::from(bounds.size.width) * 2.).max(160.);
                    (
                        f64::from((pointer.x - bounds.center().x) / px(reach)),
                        f64::from((pointer.y - bounds.center().y) / px(reach)),
                    )
                });
                avatar.motion.look_at(gaze);
                avatar.last_reduced = reduced;
                avatar.dirty = false;
                let frame = avatar.motion.sample(
                    now,
                    seed_hash(&avatar.config.seed),
                    avatar.state,
                    true,
                    reduced,
                    avatar.size < 48.,
                )?;
                Some(FrameInput {
                    config: avatar.config.clone(),
                    options: RenderOptions {
                        state: avatar.state,
                        shadow: false,
                        frame,
                    },
                    edge: ((avatar.size * scale).ceil() as u32).clamp(32, 768),
                })
            });
            if let Ok(Some(input)) = result {
                inputs.push(input);
                targets.push(entry.clone());
                if inputs.len() == 30 {
                    break;
                }
            }
        }
        if inputs.is_empty() {
            return;
        }
        let Some(renderer) = &self.renderer else {
            return;
        };
        let Ok(reply) = renderer.batch(inputs) else {
            self.schedule(window, cx);
            return;
        };
        self.pending = true;
        // Register the next display callback now. Waiting until the async
        // reply arrives inserts an extra refresh between otherwise-ready
        // frames and caps actual image delivery at half the display rate.
        self.schedule(window, cx);
        let target_window = window.window_handle();
        self.task = Some(cx.spawn(async move |view, cx| {
            let result = reply.await;
            let _ = view.update(cx, |this, cx| {
                this.pending = false;
                if let Ok(Ok(batch)) = result {
                    if this.metrics.len() == 8192 {
                        this.metrics.pop_front();
                    }
                    this.metrics.push_back(batch.metrics);
                    this.presented += 1;
                    if this.deliveries_ms.len() == 8192 {
                        this.deliveries_ms.pop_front();
                    }
                    this.deliveries_ms.push_back(this.now());
                    for (target, image) in targets.into_iter().zip(batch.images) {
                        let _ = target.update(cx, |avatar, cx| {
                            if !avatar.visible.load(Ordering::Relaxed) {
                                return;
                            }
                            if let Some(old) = avatar.image.replace(image) {
                                cx.drop_image(old, None);
                            }
                            avatar.failed = false;
                            cx.notify();
                        });
                    }
                } else {
                    for target in targets {
                        let _ = target.update(cx, |avatar, cx| {
                            avatar.failed = true;
                            cx.notify();
                        });
                    }
                }
            });
            let _ = target_window.update(cx, |_, window, cx| {
                let _ = view.update(cx, |clock, cx| clock.schedule(window, cx));
            });
        }));
    }
}
pub struct AvatarPortrait {
    pub config: AvatarConfig,
    pub state: State,
    pub reduced: bool,
    pub size: f32,
    animator: Entity<AvatarAnimator>,
    motion: MotionClock,
    image: Option<Arc<RenderImage>>,
    visible: Arc<AtomicBool>,
    bounds: Rc<Cell<Bounds<Pixels>>>,
    dirty: bool,
    last_reduced: bool,
    failed: bool,
}
impl AvatarPortrait {
    pub fn is_ready(&self) -> bool {
        self.image.is_some() && !self.failed
    }
    pub fn create(
        animator: &Entity<AvatarAnimator>,
        config: AvatarConfig,
        size: f32,
        cx: &mut App,
    ) -> Entity<Self> {
        let view = cx.new(|_| Self {
            config,
            state: State::Idle,
            reduced: false,
            size,
            animator: animator.clone(),
            motion: MotionClock::default(),
            image: None,
            visible: Arc::new(AtomicBool::new(false)),
            bounds: Rc::new(Cell::new(Bounds::default())),
            dirty: true,
            last_reduced: false,
            failed: false,
        });
        animator.update(cx, |clock, _| clock.entries.push(view.downgrade()));
        view
    }
    pub fn state(&mut self, state: State, cx: &mut Context<Self>) {
        self.state = state;
        self.dirty = true;
        cx.notify();
    }
    pub fn loading(&mut self, loading: bool, cx: &mut Context<Self>) {
        let now = self.animator.read(cx).now();
        self.motion.set_loading(loading, now);
        self.dirty = true;
        cx.notify();
    }
    pub fn action(&mut self, action: ngertiin_avatar::Action, cx: &mut Context<Self>) {
        if !self.reduced && !cx.reduce_motion() {
            self.motion.play(action, self.animator.read(cx).now());
            self.dirty = true;
            cx.notify();
        }
    }
    pub fn suspend(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.visible.store(false, Ordering::Relaxed);
        self.motion.look_at(None);
        self.dirty = true;
        if let Some(image) = self.image.take() {
            cx.drop_image(image, Some(window));
        }
    }
}
impl Render for AvatarPortrait {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if window.is_visible()
            && self.visible.load(Ordering::Relaxed)
            && !self.reduced
            && !cx.reduce_motion()
        {
            window.request_animation_frame();
        }
        let animator = self.animator.clone();
        animator.update(cx, |clock, cx| clock.schedule(window, cx));
        let visible = self.visible.clone();
        let bounds = self.bounds.clone();
        let mut portrait = div()
            .id("avatar-portrait")
            .relative()
            .size(px(self.size))
            .on_click(cx.listener(|this, _, _, cx| this.action(ngertiin_avatar::Action::Boop, cx)));
        if let Some(image) = &self.image {
            portrait = portrait.child(img(image.clone()).size_full());
        } else {
            let color = self.config.color.palette()[1];
            let hex = u32::from_str_radix(&color[1..], 16).unwrap_or(0xaf77e4);
            portrait = portrait.child(
                div()
                    .size_full()
                    .rounded_full()
                    .bg(rgb(hex))
                    .opacity(if self.failed { 1. } else { 0.5 }),
            );
        }
        portrait.child(
            canvas(
                move |area, window, _| {
                    bounds.set(area);
                    visible.store(
                        window.is_visible()
                            && !area.intersect(&window.content_mask().bounds).is_empty(),
                        Ordering::Relaxed,
                    );
                },
                |_, _, _, _| {},
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full(),
        )
    }
}

use crate::ui::avatar_view::{AvatarAnimator, AvatarPortrait};
use crate::ui::{avatar::AvatarRenderer, controls::*, theme::Palette};
use gpui_kit::component::ActiveTheme;
use gpui_kit::*;
use ngertiin_avatar::Action;
use ngertiin_avatar::*;
use std::sync::Arc;

/// Fixed-time native component gallery. Presentation and export share the same
/// independent Rust recipe and sampling code; no submission/network policy.
pub struct AvatarGallery {
    config: AvatarConfig,
    state: State,
    action: Option<Action>,
    time: f64,
    loading: bool,
    reduced: bool,
    renderer: Option<AvatarRenderer>,
    image: Option<Arc<RenderImage>>,
    task: Option<Task<()>>,
    status: String,
    busy: bool,
    live: bool,
    offscreen: bool,
    count: usize,
    animator: Option<Entity<AvatarAnimator>>,
    portraits: Vec<Entity<AvatarPortrait>>,
    measurement: Option<(
        std::time::Instant,
        gpui_kit::profiler::FrameDurationSnapshot,
        chrono::DateTime<chrono::Utc>,
    )>,
    benchmark: Option<Task<()>>,
    benchmarking: bool,
}
impl Default for AvatarGallery {
    fn default() -> Self {
        Self {
            config: AvatarConfig::default_agent("ignored", true).expect("Tobi recipe"),
            state: State::Idle,
            action: None,
            time: 0.,
            loading: false,
            reduced: false,
            renderer: None,
            image: None,
            task: None,
            status: "Select a fixed time, recipe, expression or state.".into(),
            busy: false,
            live: false,
            offscreen: false,
            count: 1,
            animator: None,
            portraits: vec![],
            measurement: None,
            benchmark: None,
            benchmarking: false,
        }
    }
}
impl AvatarGallery {
    pub fn is_benchmarking(&self) -> bool {
        self.benchmarking
    }
    fn visible_measurement_seconds(&self, cx: &App) -> f64 {
        let Some((started, _, _)) = &self.measurement else {
            return 0.;
        };
        let Some(animator) = &self.animator else {
            return 0.;
        };
        if animator.read(cx).visibility_truncated {
            return -1.;
        }
        let changes = &animator.read(cx).visibility_changes;
        let Some(&(begin, mut visible)) = changes.front() else {
            return 0.;
        };
        let mut cursor = begin;
        let mut active = 0.;
        for &(at, next) in changes.iter().skip(1) {
            if visible {
                active += at - cursor;
            }
            cursor = at;
            visible = next;
        }
        if visible {
            active += begin + started.elapsed().as_secs_f64() * 1000. - cursor;
        }
        active / 1000.
    }
    pub fn new(animator: Entity<AvatarAnimator>) -> Self {
        Self {
            animator: Some(animator),
            ..Self::default()
        }
    }
    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.live {
            for portrait in &self.portraits {
                portrait.update(cx, |avatar, cx| {
                    if self.count == 1 {
                        avatar.config = self.config.clone();
                    }
                    avatar.reduced = self.reduced;
                    avatar.state(self.state, cx);
                    avatar.loading(self.loading, cx);
                });
            }
            cx.notify();
            return;
        }
        if self.busy {
            return;
        }
        self.busy = true;
        let result = (|| {
            if self.renderer.is_none() {
                self.renderer = Some(AvatarRenderer::new().map_err(|e| e.to_string())?);
            }
            self.renderer
                .as_ref()
                .expect("Initialized renderer")
                .render(self.config.clone(), self.options())
                .map_err(str::to_string)
        })();
        match result {
            Ok(reply) => {
                self.status = "Preparing native avatar…".into();
                self.task = Some(cx.spawn(async move |view, cx| {
                    let result = reply.await.unwrap_or_else(|_| {
                        Err("Avatar worker stopped. Retry the frame.".into())
                    });
                    let _ = view.update(cx, |this, cx| {
                        this.busy = false;
                        match result {
                            Ok(image) => {
                                if let Some(previous) = this.image.replace(image) {
                                    cx.drop_image(previous, None);
                                }
                                this.status = "Rust material, original eye shadows and fixed-time pose rendered.".into();
                            }
                            Err(error) => this.status = error,
                        }
                        cx.notify();
                    });
                }));
            }
            Err(error) => {
                self.busy = false;
                self.status = error;
            }
        }
        cx.notify();
    }
    fn options(&self) -> RenderOptions {
        RenderOptions {
            state: self.state,
            shadow: false,
            frame: sample_frame(
                self.time,
                self.state,
                self.action.map(|a| (a, 0.5)),
                self.reduced,
                self.loading,
            ),
        }
    }
    fn live_count(&mut self, count: usize, window: &mut Window, cx: &mut Context<Self>) {
        self.offscreen = false;
        for portrait in self.portraits.drain(..) {
            portrait.update(cx, |avatar, cx| avatar.suspend(window, cx));
        }
        self.count = count;
        let animator = self
            .animator
            .get_or_insert_with(|| cx.new(|cx| AvatarAnimator::new(window, cx)))
            .clone();
        for i in 0..count {
            let config = if count == 1 {
                self.config.clone()
            } else {
                AvatarConfig::create(&format!("native-live-{i}"), AvatarOverrides::default())
                    .expect("Fixture identity")
            };
            self.portraits.push(AvatarPortrait::create(
                &animator,
                config,
                if count == 1 { 128. } else { 32. },
                cx,
            ));
        }
        self.live = true;
        self.refresh(cx);
    }
    pub fn retire(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        // Dropping the receiver cancels queued preparation. A bounded active job
        // may finish and is discarded. No frame loop or hidden-window timer runs.
        self.task = None;
        self.benchmark = None;
        self.benchmarking = false;
        self.measurement = None;
        for portrait in &self.portraits {
            portrait.update(cx, |avatar, cx| avatar.suspend(window, cx));
        }
        self.busy = false;
        if let Some(image) = self.image.take() {
            cx.drop_image(image, Some(window));
        }
    }
    fn measure(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some((started, earlier, started_utc)) = self.measurement.take() {
            let snapshot = window.frame_duration_snapshot();
            let groups: Vec<_> = snapshot.by_refresh_interval.iter().map(|group| {
                let group = earlier.by_refresh_interval.iter().find(|g|g.refresh_interval==group.refresh_interval).map_or_else(||group.clone(),|before|group.since(before));
                serde_json::json!({"refresh_ms":group.refresh_interval.map(|d|d.as_secs_f64()*1000.),"drawn":group.frames_drawn,"on_time":group.frames_on_time,"late":group.frames_late,"missed_refreshes":group.missed_refreshes,"unmeasured":group.frames_unmeasured,"draw_p50_ms":group.draw_duration.value_at_quantile(0.5) as f64/1e6,"draw_p95_ms":group.draw_duration.value_at_quantile(0.95) as f64/1e6,"work_p95_ms":group.work.value_at_quantile(0.95) as f64/1e6})
            }).collect();
            let mut intervals = snapshot.present_interval_histogram.clone();
            let _ = intervals.subtract(&earlier.present_interval_histogram);
            let batches = self.animator.as_ref().map(|a| a.read(cx).metrics.clone());
            let deliveries = self
                .animator
                .as_ref()
                .map(|a| a.read(cx).deliveries_ms.clone());
            let visibility = self
                .animator
                .as_ref()
                .map(|a| a.read(cx).visibility_changes.clone());
            let textures_ready = self
                .portraits
                .iter()
                .filter(|avatar| avatar.read(cx).is_ready())
                .count();
            let visibility_truncated = self
                .animator
                .as_ref()
                .is_none_or(|a| a.read(cx).visibility_truncated);
            let result = serde_json::json!({"version":2,"visibility_truncated":visibility_truncated,"texture_ready_count":textures_ready,"visibility_changes":visibility,"started_utc":started_utc.to_rfc3339(),"ended_utc":chrono::Utc::now().to_rfc3339(),"elapsed_seconds":started.elapsed().as_secs_f64(),"avatars":self.count,"state":format!("{:?}",self.state),"reduced":self.reduced,"loading":self.loading,"offscreen":self.offscreen,"viewport":[f32::from(window.viewport_size().width),f32::from(window.viewport_size().height)],"device_scale":window.scale_factor(),"frames":groups,"present_intervals":{"count":intervals.len(),"p50_ms":intervals.value_at_quantile(0.5) as f64/1e6,"p95_ms":intervals.value_at_quantile(0.95) as f64/1e6,"p99_ms":intervals.value_at_quantile(0.99) as f64/1e6},"compositor_samples":batches,"image_deliveries_ms":deliveries});
            let path = crate::host::profile_root()
                .map(|p| p.join(format!("avatar-performance-{}.json", uuid::Uuid::new_v4())));
            self.status = "Saving native frame measurements…".into();
            cx.spawn(async move |view, cx| {
                let result = cx
                    .background_executor()
                    .spawn(async move {
                        path.and_then(|path| {
                            std::fs::write(&path, serde_json::to_vec_pretty(&result)?)?;
                            Ok(path)
                        })
                    })
                    .await;
                let _ = view.update(cx, |this, cx| {
                    this.status = match result {
                        Ok(path) => format!("Measurements saved to {}", path.display()),
                        Err(e) => e.to_string(),
                    };
                    cx.notify();
                });
            })
            .detach();
        } else {
            if let Some(animator) = &self.animator {
                animator.update(cx, |a, _| {
                    a.metrics.clear();
                    a.deliveries_ms.clear();
                    a.visibility_changes.clear();
                    a.visibility_truncated = false;
                    a.visibility_changes
                        .push_back((a.now(), window.is_visible()));
                });
            }
            self.measurement = Some((
                std::time::Instant::now(),
                window.frame_duration_snapshot(),
                chrono::Utc::now(),
            ));
            self.status =
                "Recording actual GPUI draw/presentation timing. Press again to save.".into();
        }
        cx.notify();
    }
    fn benchmark(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.benchmarking {
            self.benchmark = None;
            self.benchmarking = false;
            self.measurement = None;
            self.status = "Benchmark stopped.".into();
            cx.notify();
            return;
        }
        self.benchmarking = true;
        self.benchmark=Some(cx.spawn_in(window,async move |view,cx| {
            for count in [1,10,30] {
                for state in [State::Idle,State::Thinking,State::Working] {
                    if view.update_in(cx,|this,window,cx| {this.state=state;this.live_count(count,window,cx);this.status=format!("Benchmark: {count} avatars · {state:?} · preparing textures");}).is_err(){return;}
                    let mut ready = false;
                    for _ in 0..300 {
                        let Ok(prepared) = view.update(cx,|this,cx| this.portraits.len()==count && this.portraits.iter().all(|avatar|avatar.read(cx).is_ready())) else {return;};
                        if prepared { ready=true; break; }
                        cx.background_executor().timer(std::time::Duration::from_millis(200)).await;
                    }
                    if !ready {
                        let _=view.update(cx,|this,cx|{this.benchmarking=false;this.status="Benchmark stopped: avatar textures did not become ready. Retry the workload.".into();cx.notify();});
                        return;
                    }
                    cx.background_executor().timer(std::time::Duration::from_secs(5)).await;
                    if view.update_in(cx,|this,window,cx|this.measure(window,cx)).is_err(){return;}
                    loop {
                        let Ok(visible) = view.update(cx, |this, cx| this.visible_measurement_seconds(cx)) else {return;};
                        if visible < 0. {
                            let _=view.update(cx,|this,cx|{this.benchmarking=false;this.measurement=None;this.status="Benchmark stopped: visibility history exceeded its bound. Retry this workload.".into();cx.notify();});
                            return;
                        }
                        if visible >= 120. { break; }
                        cx.background_executor().timer(std::time::Duration::from_secs_f64((120.-visible).clamp(0.05,5.))).await;
                    }
                    if view.update_in(cx,|this,window,cx|this.measure(window,cx)).is_err(){return;}
                }
            }
            let _=view.update(cx,|this,cx|{this.benchmarking=false;this.status="Nine native avatar workloads recorded. Review frame, delivery and process measurements.".into();cx.notify();});
        }));
        cx.notify();
    }
    fn cycle<T: Copy + PartialEq>(current: T, values: &[T]) -> T {
        values[(values.iter().position(|v| *v == current).unwrap_or(0) + 1) % values.len()]
    }
}
impl Render for AvatarGallery {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let dark = cx.theme().mode.is_dark();
        let p = Palette::new(dark);
        let portrait = |edge: f32| {
            let container = div().size(px(edge));
            if let Some(image) = &self.image {
                container
                    .child(img(image.clone()).size_full())
                    .into_any_element()
            } else {
                container
                    .bg(p.color("muted"))
                    .rounded_full()
                    .into_any_element()
            }
        };
        let portraits = if self.live {
            row()
                .children(self.portraits.iter().cloned())
                .into_any_element()
        } else {
            row()
                .items_end()
                .children([32., 64., 128., 256.].map(portrait))
                .into_any_element()
        };
        let portraits = if self.offscreen {
            div()
                .h_0()
                .overflow_hidden()
                .child(portraits)
                .into_any_element()
        } else {
            portraits
        };
        card(p).size_full().child(title("Avatar · Rust recipe, layers and motion"))
            .child(row()
                .child(button("avatar-live","Live animation",ButtonKind::Primary,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,window,cx|this.live_count(1,window,cx))))
                .child(button("avatar-live-ten","10 avatars",ButtonKind::Default,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,window,cx|this.live_count(10,window,cx))))
                .child(button("avatar-live-thirty","30 avatars",ButtonKind::Default,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,window,cx|this.live_count(30,window,cx))))
                .child(button("avatar-fixed","Fixed frames",ButtonKind::Default,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,window,cx|{for portrait in this.portraits.drain(..){portrait.update(cx,|a,cx|a.suspend(window,cx));}this.live=false;this.refresh(cx);}))))
            .child(portraits)
            .child(caption(format!("{:?} / {:?} / {:?} · {:?} · {:.0} ms",self.config.shape,self.config.color,self.config.face,self.state,self.time),p))
            .child(row()
                .child(button("avatar-shape","Shape",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.config.shape=Self::cycle(this.config.shape,&Shape::ALL);this.refresh(cx);})))
                .child(button("avatar-color","Color",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.config.color=Self::cycle(this.config.color,&Color::ALL);this.refresh(cx);})))
                .child(button("avatar-face","Expression",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.config.face=Self::cycle(this.config.face,&Face::ALL);this.refresh(cx);})))
                .child(button("avatar-state","State",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.state=Self::cycle(this.state,&State::ALL);this.refresh(cx);})))
                .child(button("avatar-action","Action",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.action=Some(this.action.map_or(Action::Boop,|a|Self::cycle(a,&Action::ALL)));if this.live { for portrait in &this.portraits {portrait.update(cx,|avatar,cx|avatar.action(this.action.expect("Selected action"),cx));}}else{this.refresh(cx);}})))
                .child(button("avatar-time","Advance 167 ms",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.time+=167.;this.refresh(cx);}))))
            .child(row()
                .child(button("avatar-loading",if self.loading {"Loading on"} else {"Loading off"},ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.loading = !this.loading;this.refresh(cx);})))
                .child(button("avatar-reduced",if self.reduced {"Reduced motion on"} else {"Reduced motion off"},ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.reduced = !this.reduced;this.refresh(cx);})))
                .child(button("avatar-reset","Reset Tobi",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {
                    this.config=AvatarConfig::default_agent("ignored",true).expect("Tobi recipe");this.state=State::Idle;this.action=None;this.time=0.;this.loading=false;this.reduced=false;this.refresh(cx);
                })))
                .child(button("avatar-retry","Retry frame",ButtonKind::Default,p,cx).disabled_state(self.busy || self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| this.refresh(cx)))))
            .child(button("avatar-benchmark",if self.benchmarking {"Stop benchmark matrix"}else{"Run benchmark matrix"},ButtonKind::Default,p,cx).on_click(cx.listener(|this,_,window,cx|this.benchmark(window,cx))))
            .child(button("avatar-offscreen",if self.offscreen {"Restore visible avatars"}else{"Clip avatars offscreen"},ButtonKind::Default,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,_,cx| {this.offscreen = !this.offscreen;cx.notify();})))
            .child(button("avatar-measure",if self.measurement.is_some(){"Save measurements"}else{"Start measurements"},ButtonKind::Default,p,cx).disabled_state(self.benchmarking, p).on_click(cx.listener(|this,_,window,cx|this.measure(window,cx))))
            .child(caption(self.status.clone(),p))
            .child(caption("Live portraits share one visibility-aware clock. Fixed frames and exports use the same Rust recipe and motion samplers.",p))
    }
}

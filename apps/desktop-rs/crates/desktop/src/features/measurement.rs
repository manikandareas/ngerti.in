//! Gallery-only visible-window measurements; no synthetic redraw loop is added.
use crate::shell::Gallery;
use gpui_kit::*;
use std::time::Instant;

pub(crate) struct ContentMeasurement {
    started: Instant,
    utc: chrono::DateTime<chrono::Utc>,
    earlier: gpui_kit::profiler::FrameDurationSnapshot,
    workload: &'static str,
    viewport: [f32; 2],
    scale: f32,
    visibility: Vec<(f64, bool)>,
    _subscription: Subscription,
}
impl ContentMeasurement {
    fn visible_seconds(&self) -> f64 {
        let elapsed = self.started.elapsed().as_secs_f64();
        let mut total = 0.;
        for (ix, &(at, visible)) in self.visibility.iter().enumerate() {
            if visible {
                total += self.visibility.get(ix + 1).map_or(elapsed, |e| e.0) - at;
            }
        }
        total
    }
}
impl Gallery {
    pub(crate) fn measure_content(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.measurement.is_some() {
            return;
        }
        let workload = match self.scene {
            crate::shell::Scene::Content => self
                .content_component
                .as_ref()
                .map(|view| view.read(cx).workload_id())
                .unwrap_or("content-not-ready"),
            crate::shell::Scene::Pdf => "pdf-current-fixture",
            _ => return,
        };
        if let Some(content) = &self.content_component {
            content.update(cx, |content, cx| {
                content.measurement_locked = true;
                cx.notify();
            });
        }
        let subscription = cx.observe_window_visibility(window, |this, visibility, _, _| {
            if let Some(measurement) = &mut this.measurement
                && measurement.visibility.len() < 256
            {
                measurement.visibility.push((
                    measurement.started.elapsed().as_secs_f64(),
                    visibility.is_visible(),
                ));
            }
        });
        self.measurement = Some(ContentMeasurement {
            started: Instant::now(),
            utc: chrono::Utc::now(),
            earlier: window.frame_duration_snapshot(),
            workload,
            viewport: [
                f32::from(window.viewport_size().width),
                f32::from(window.viewport_size().height),
            ],
            scale: window.scale_factor(),
            visibility: vec![(0., window.is_visible())],
            _subscription: subscription,
        });
        self.status = format!(
            "Recording {workload}: 120 visible seconds. Exercise the content controls and scrolling."
        );
        self.measurement_task = Some(cx.spawn_in(window, async move |view, cx| {
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_secs(1))
                    .await;
                let done = view.update_in(cx, |this, window, cx| {
                    let Some(measurement) = &this.measurement else {
                        return true;
                    };
                    let invalid = measurement.viewport
                        != [
                            f32::from(window.viewport_size().width),
                            f32::from(window.viewport_size().height),
                        ]
                        || measurement.scale != window.scale_factor()
                        || measurement.visibility.len() >= 256;
                    if invalid || measurement.visible_seconds() >= 120. {
                        this.finish_content_measurement(!invalid, window, cx);
                        true
                    } else {
                        false
                    }
                });
                if done.unwrap_or(true) {
                    break;
                }
            }
        }));
        cx.notify();
    }
    fn finish_content_measurement(
        &mut self,
        valid: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(measurement) = self.measurement.take() else {
            return;
        };
        if let Some(content) = &self.content_component {
            content.update(cx, |content, cx| {
                content.measurement_locked = false;
                cx.notify();
            });
        }
        let snapshot = window.frame_duration_snapshot();
        let groups: Vec<_> = snapshot.by_refresh_interval.iter().map(|group| {
            let group = measurement.earlier.by_refresh_interval.iter().find(|g| g.refresh_interval == group.refresh_interval)
                .map_or_else(|| group.clone(), |before| group.since(before));
            serde_json::json!({"refresh_ms":group.refresh_interval.map(|d|d.as_secs_f64()*1000.),
                "drawn":group.frames_drawn,"missed_refreshes":group.missed_refreshes,
                "draw_p50_ms":group.draw_duration.value_at_quantile(0.5) as f64/1e6,
                "draw_p95_ms":group.draw_duration.value_at_quantile(0.95) as f64/1e6,
                "draw_p99_ms":group.draw_duration.value_at_quantile(0.99) as f64/1e6,
                "work_p95_ms":group.work.value_at_quantile(0.95) as f64/1e6})
        }).collect();
        let result = serde_json::json!({"version":1,"workload":measurement.workload,"valid":valid,
            "started_utc":measurement.utc.to_rfc3339(),"ended_utc":chrono::Utc::now().to_rfc3339(),
            "elapsed_seconds":measurement.started.elapsed().as_secs_f64(),"visible_seconds":measurement.visible_seconds(),
            "visibility_changes":measurement.visibility,"viewport":measurement.viewport,"device_scale":measurement.scale,
            "frames":groups,"boundary":"Native gallery content; real input/redraws only, no synthetic animation. Explicit process sampling and action record are separate."});
        self.status = if valid {
            "Saving content measurements…"
        } else {
            "Content measurement invalid: viewport, scale or visibility history changed"
        }
        .into();
        cx.spawn(async move |view, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let path = crate::host::profile_root()?
                        .join(format!("content-performance-{}.json", uuid::Uuid::new_v4()));
                    std::fs::write(&path, serde_json::to_vec_pretty(&result)?)?;
                    anyhow::Ok(path)
                })
                .await;
            let _ = view.update(cx, |this, cx| {
                this.status = match result {
                    Ok(path) => format!(
                        "Content measurements saved to {} · valid: {valid}",
                        path.display()
                    ),
                    Err(error) => format!("Could not save content measurements: {error}"),
                };
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}

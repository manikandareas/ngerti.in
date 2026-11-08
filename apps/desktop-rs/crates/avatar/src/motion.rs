use crate::{Action, Face, State};
use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pose {
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub eye_left: f64,
    pub eye_right: f64,
    pub gaze_x: f64,
    pub gaze_y: f64,
}
impl Default for Pose {
    fn default() -> Self {
        Self {
            x: 0.,
            y: 0.,
            rotation: 0.,
            scale_x: 1.,
            scale_y: 1.,
            eye_left: 1.,
            eye_right: 1.,
            gaze_x: 0.,
            gaze_y: 0.,
        }
    }
}
pub fn face_for_state(face: Face, state: State) -> Face {
    match state {
        State::Idle => face,
        State::Listening => Face::Curious,
        State::Thinking | State::Working => Face::Focused,
        State::Celebrating => Face::Excited,
        State::Sleeping => Face::Sleepy,
        State::Error => Face::Surprised,
    }
}
fn ease(value: f64) -> f64 {
    let p = value.clamp(0., 1.);
    p * p * (3. - 2. * p)
}
fn blink(time: f64) -> f64 {
    let cycle = (time / 12000.).floor();
    let phase = time % 12000.;
    let offset = (cycle * 7.31).sin() * 550.;
    let mut starts = vec![2100. + offset, 6200. - offset, 10000. + offset * 0.5];
    if cycle % 3. == 1. {
        starts.push(6460. - offset);
    }
    for start in starts {
        let elapsed = phase - start;
        if !(0. ..=190.).contains(&elapsed) {
            continue;
        }
        let open = if elapsed < 55. {
            1. - ease(elapsed / 55.)
        } else {
            ease((elapsed - 55.) / 135.)
        };
        return 0.06 + open * 0.94;
    }
    1.
}
fn idle_focus(step: f64) -> (f64, f64) {
    if step % 4. == 0. {
        (0., 0.)
    } else {
        ((step * 4.73).sin() * 0.34, (step * 2.37).sin() * 0.2)
    }
}
impl Action {
    pub fn duration(self) -> f64 {
        match self {
            Self::Boop | Self::Wink => 650.,
            Self::Wave | Self::Spin => 1100.,
            Self::Hop => 850.,
            Self::Wiggle => 900.,
        }
    }
}
pub fn sample_pose(time: f64, state: State, action: Option<(Action, f64)>, reduced: bool) -> Pose {
    let mut p = Pose::default();
    if reduced || !time.is_finite() {
        return p;
    }
    let t = time / 1000.;
    let breathe = (t * 2.).sin();
    p.y = breathe * 1.5;
    p.scale_x = 1. - breathe * 0.006;
    p.scale_y = 1. + breathe * 0.006;
    match state {
        State::Listening => p.rotation = -5. + (t * 1.5).sin() * 2.,
        State::Thinking => {
            p.rotation = (t * 1.3).sin() * 6.;
            p.y -= 2.;
        }
        State::Working => p.rotation = (t * 5.).sin() * 2.5,
        State::Celebrating => {
            p.y -= (t * 4.).sin().abs() * 9.;
            p.rotation = (t * 4.).sin() * 8.;
        }
        State::Sleeping => {
            p.rotation = 7.;
            p.scale_y = 1. + breathe * 0.015;
        }
        State::Error => p.x = (t * 3.).sin() * 1.5,
        State::Idle => {}
    }
    let step = (time / 3600.).floor();
    let previous = idle_focus(step - 1.);
    let next = idle_focus(step);
    let settle = ease((time % 3600.) / 220.);
    if state != State::Sleeping {
        p.gaze_x = previous.0 + (next.0 - previous.0) * settle;
        p.gaze_y = previous.1 + (next.1 - previous.1) * settle;
    }
    p.eye_left = blink(time);
    p.eye_right = blink(time - 8.);
    let Some((action, progress)) = action.filter(|(_, x)| (0. ..1.).contains(x)) else {
        return p;
    };
    let envelope = (std::f64::consts::PI * progress).sin();
    let wave = (progress * std::f64::consts::PI * 6.).sin();
    match action {
        Action::Boop => {
            p.scale_x += envelope * 0.12;
            p.scale_y -= envelope * 0.1;
            p.y += envelope * 5.;
        }
        Action::Wave => p.rotation += (progress * std::f64::consts::PI * 5.).sin() * envelope * 17.,
        Action::Hop => {
            p.y -= envelope * 30.;
            p.scale_x -= envelope * 0.04;
            p.scale_y += envelope * 0.08;
        }
        Action::Wiggle => {
            p.x += wave * envelope * 7.;
            p.rotation += wave * envelope * 9.;
        }
        Action::Spin => {
            p.rotation += 360. * (1. - (1. - progress).powi(3));
            p.scale_x -= envelope * 0.18;
        }
        Action::Wink => p.eye_right = (1. - envelope * 2.).max(0.08),
    }
    p
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loading {
    pub face: Face,
    pub vein_opacity: f64,
    pub ring_offset: f64,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
    pub scale_x: f64,
    pub scale_y: f64,
}
pub fn sample_loading(elapsed: f64, reduced: bool) -> Loading {
    let phase = if elapsed.is_finite() {
        elapsed.rem_euclid(12000.) / 12000.
    } else {
        0.
    };
    let intensity = if reduced {
        0.35
    } else {
        ease((phase - 0.22) / 0.22) * (1. - ease((phase - 0.67) / 0.2))
    };
    let pulse = if reduced {
        0.
    } else {
        (phase * std::f64::consts::PI * 30.).sin() * intensity
    };
    let stops = [
        (0., 0.),
        (0.25, 20.),
        (0.38, 50.),
        (0.45, 100.),
        (0.65, 400.),
        (0.75, 460.),
        (0.85, 480.),
        (1., 500.),
    ];
    let index = stops.iter().position(|(at, _)| *at > phase).unwrap_or(7);
    let (a, av) = stops[index.saturating_sub(1)];
    let (b, bv) = stops[index];
    Loading {
        face: if reduced || !(0.25..0.8).contains(&phase) {
            Face::Calm
        } else if phase < 0.68 {
            Face::Focused
        } else {
            Face::Surprised
        },
        vein_opacity: if reduced {
            0.45
        } else {
            intensity * (0.9 + pulse * 0.1)
        },
        ring_offset: if reduced {
            0.
        } else {
            -(av + (bv - av) * (phase - a) / (b - a))
        },
        x: pulse * 1.5,
        y: if reduced {
            0.
        } else {
            -(phase * std::f64::consts::PI * 2.).sin() * 2. - intensity * 5.
        },
        rotation: if reduced {
            0.
        } else {
            (phase * std::f64::consts::PI * 2.).sin() * 2. + pulse * 2.
        },
        scale_x: 1. + pulse * 0.02,
        scale_y: 1. - pulse * 0.02,
    }
}

/// Stateful smoothing only; the host decides visibility and schedules frames.
/// Hidden/offscreen/occluded avatars return None and perform no frame work.
#[derive(Default)]
pub struct MotionClock {
    last_time: Option<f64>,
    gaze: (f64, f64),
    head: (f64, f64),
    pointer: Option<(f64, f64)>,
    action: Option<(Action, f64)>,
    loading_started: Option<f64>,
}
#[derive(Clone, Copy, Debug, Default)]
pub struct Frame {
    pub pose: Pose,
    pub head_x: f64,
    pub loading: Option<Loading>,
}

/// Stateless fixed-time sample used by native capture controls and exports.
pub fn sample_frame(
    time: f64,
    state: State,
    action: Option<(Action, f64)>,
    reduced: bool,
    loading: bool,
) -> Frame {
    let mut pose = sample_pose(time, state, action, reduced);
    let loading = loading.then(|| sample_loading(time, reduced));
    if let Some(l) = loading {
        pose.x = l.x;
        pose.y = l.y;
        pose.rotation = l.rotation;
        pose.scale_x = l.scale_x;
        pose.scale_y = l.scale_y;
    }
    Frame {
        pose,
        head_x: 0.,
        loading,
    }
}
impl MotionClock {
    pub fn look_at(&mut self, target: Option<(f64, f64)>) {
        self.pointer = target.map(|(x, y)| {
            (
                if x.is_finite() { x.clamp(-1., 1.) } else { 0. },
                if y.is_finite() { y.clamp(-1., 1.) } else { 0. },
            )
        });
    }
    pub fn play(&mut self, action: Action, now: f64) {
        if now.is_finite() {
            self.action = Some((action, now));
        }
    }
    pub fn set_loading(&mut self, loading: bool, now: f64) {
        if loading == self.loading_started.is_some() || !now.is_finite() {
            return;
        }
        self.loading_started = loading.then_some(now);
        self.action = None;
    }
    pub fn sample(
        &mut self,
        now: f64,
        seed_offset: u32,
        state: State,
        visible: bool,
        reduced: bool,
        compact: bool,
    ) -> Option<Frame> {
        if !visible || !now.is_finite() {
            self.last_time = None;
            self.pointer = None;
            return None;
        }
        if reduced {
            self.pointer = None;
        }
        let elapsed = self
            .last_time
            .map_or(32., |last| (now - last).clamp(0., 64.));
        self.last_time = Some(now);
        self.action = self.action.filter(|(a, start)| now - start < a.duration());
        let action = self
            .action
            .map(|(a, start)| (a, (now - start) / a.duration()));
        let mut pose = sample_pose(now + f64::from(seed_offset % 4700), state, action, reduced);
        let loading = self
            .loading_started
            .map(|start| sample_loading(now - start, reduced));
        if compact && state == State::Idle && action.is_none() && loading.is_none() {
            pose.x = 0.;
            pose.y = 0.;
            pose.rotation = 0.;
            pose.scale_x = 1.;
            pose.scale_y = 1.;
        }
        if let Some(l) = loading {
            pose.x = l.x;
            pose.y = l.y;
            pose.rotation = l.rotation;
            pose.scale_x = l.scale_x;
            pose.scale_y = l.scale_y;
        }
        let focus = self.pointer.unwrap_or((pose.gaze_x, pose.gaze_y));
        let gaze_smoothing = 1. - (-elapsed / 65.).exp();
        let head_smoothing = 1. - (-elapsed / 180.).exp();
        self.gaze = if reduced {
            (0., 0.)
        } else {
            (
                self.gaze.0 + (focus.0 - self.gaze.0) * gaze_smoothing,
                self.gaze.1 + (focus.1 - self.gaze.1) * gaze_smoothing,
            )
        };
        self.head = if reduced {
            (0., 0.)
        } else {
            (
                self.head.0 + (focus.0 - self.head.0) * head_smoothing,
                self.head.1 + (focus.1 - self.head.1) * head_smoothing,
            )
        };
        pose.x += self.head.0 * 2.;
        pose.y += self.head.1;
        pose.rotation += self.head.0 * 5.;
        pose.scale_x *= 1. - self.head.0.abs() * 0.025;
        pose.gaze_x = self.gaze.0;
        pose.gaze_y = self.gaze.1;
        Some(Frame {
            pose,
            head_x: self.head.0,
            loading,
        })
    }
}

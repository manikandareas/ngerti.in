//! Headless CPU diagnostic, deliberately separate from native frame/presentation proof.
use ngertiin_avatar::*;
use ngertiin_desktop::ui::avatar::{Compositor, FrameInput};
use std::time::Instant;
fn main() -> anyhow::Result<()> {
    let mut compositor = Compositor::default();
    let mut cases = vec![];
    for count in [1, 10, 30] {
        for state in [State::Idle, State::Thinking, State::Working] {
            let mut frames = (0..count)
                .map(|i| FrameInput {
                    config: if count == 1 {
                        AvatarConfig::default_agent("ignored", true).unwrap()
                    } else {
                        AvatarConfig::create(
                            &format!("native-live-{i}"),
                            AvatarOverrides::default(),
                        )
                        .unwrap()
                    },
                    options: RenderOptions {
                        state,
                        shadow: false,
                        frame: sample_frame(0., state, None, false, false),
                    },
                    edge: if count == 1 { 256 } else { 64 },
                })
                .collect::<Vec<_>>();
            for frame in &frames {
                compositor.frame(frame)?;
            }
            let mut times = vec![];
            for sample in 0..240 {
                let start = Instant::now();
                for frame in &mut frames {
                    frame.options.frame =
                        sample_frame(f64::from(sample) * 1000. / 60., state, None, false, false);
                    let _ = compositor.frame(frame)?;
                }
                times.push(start.elapsed().as_secs_f64() * 1000.);
            }
            times.sort_by(f64::total_cmp);
            cases.push(serde_json::json!({"avatars":count,"state":format!("{state:?}"),"samples":times.len(),"p50_ms":times[times.len()/2],"p95_ms":times[times.len()*95/100],"p99_ms":times[times.len()*99/100]}));
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &serde_json::json!({"version":1,"kind":"headless cached CPU composition; not native draw or presentation","cases":cases})
        )?
    );
    Ok(())
}

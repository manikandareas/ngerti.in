//! Rust-only transparent SVG/PNG generator. No web renderer or portrait assets.
use ngertiin_avatar::*;
use serde::Deserialize;
use std::{error::Error, path::PathBuf};

#[derive(Deserialize)]
struct Request {
    recipe: Option<AvatarConfig>,
    seed: Option<String>,
    state: Option<State>,
    time_ms: Option<f64>,
    action: Option<Action>,
    progress: Option<f64>,
    loading: Option<bool>,
    reduced_motion: Option<bool>,
    size: Option<u32>,
}
fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err(
            "Usage: cargo run -p ngertiin-avatar --example export -- request.json output-prefix"
                .into(),
        );
    }
    let request: Request = serde_json::from_slice(&std::fs::read(&args[1])?)?;
    let recipe = match (request.recipe, request.seed) {
        (Some(recipe), None) => recipe,
        (None, Some(seed)) => AvatarConfig::create(&seed, AvatarOverrides::default())?,
        _ => return Err("Provide exactly one recipe or seed.".into()),
    };
    let size = request.size.unwrap_or(768);
    if !(32..=2048).contains(&size) {
        return Err("Export size must be between 32 and 2048 pixels.".into());
    }
    let time = request.time_ms.unwrap_or(0.);
    if !time.is_finite() || time < 0. {
        return Err("Export time must be finite and non-negative.".into());
    }
    let state = request.state.unwrap_or(State::Idle);
    let reduced = request.reduced_motion.unwrap_or(false);
    let material = Material::new(&recipe)?;
    let frame = sample_frame(
        time,
        state,
        request.action.map(|a| (a, request.progress.unwrap_or(0.5))),
        reduced,
        request.loading.unwrap_or(false),
    );
    let svg = render_avatar_svg(
        &recipe,
        &material,
        RenderOptions {
            state,
            frame,
            shadow: false,
        },
    )?;
    let tree =
        resvg::usvg::Tree::from_str(&svg_for_resvg_0_46(&svg), &resvg::usvg::Options::default())?;
    let mut png = resvg::tiny_skia::Pixmap::new(size, size).ok_or("Export allocation failed.")?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(size as f32 / 200., size as f32 / 200.),
        &mut png.as_mut(),
    );
    let prefix = PathBuf::from(&args[2]);
    std::fs::write(prefix.with_extension("svg"), svg)?;
    png.save_png(prefix.with_extension("png"))?;
    std::fs::write(
        prefix.with_extension("recipe.json"),
        serde_json::to_vec_pretty(&recipe)?,
    )?;
    println!("Exported transparent SVG and {size}×{size} PNG.");
    Ok(())
}

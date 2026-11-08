//! Renderer-independent avatar identity, material and motion.
//! Adapted from packages/avatar and the web avatar engine; see NMA-067 provenance.
mod catalog;
mod config;
mod material;
mod motion;
mod render;

pub use catalog::*;
pub use config::*;
pub use material::{Fiber, Identity, Material, MaterialCache};
pub use motion::*;
pub use render::{
    EyeGlyph, RenderOptions, eye_glyph, eye_svg, loading_layer_svg, render_avatar_svg,
    render_avatar_with_texture_svg, render_surface_svg, svg_for_resvg_0_46,
};

/// Standalone fur surface, transformed independently from the native eye layer.
/// This circle proof intentionally does not pretend to implement all product recipes.
pub fn texture_svg(seed: &str, angle: f32) -> String {
    use std::fmt::Write;
    let mut random = SeedRandom::new(seed);
    let mut result = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 200 200"><defs><radialGradient id="body"><stop stop-color="#e5d6f2"/><stop offset="1" stop-color="#a87dc9"/></radialGradient><clipPath id="clip"><circle cx="100" cy="100" r="88"/></clipPath></defs><g clip-path="url(#clip)"><g transform="rotate({angle} 100 100)"><circle cx="100" cy="100" r="88" fill="url(#body)"/>"##
    );
    for _ in 0..1600 {
        let x = 10. + random.sample() * 180.;
        let y = 10. + random.sample() * 180.;
        let dx = (random.sample() - 0.5) * 4.;
        let length = 2. + random.sample() * 5.;
        write!(result, r##"<path d="M{x:.2} {y:.2}q{dx:.2} -2 {dx:.2} -{length:.2}" fill="none" stroke="#fff0ff" stroke-opacity=".28" stroke-width=".65"/>"##).expect("Writing to String cannot fail");
    }
    result.push_str("</g></g></svg>");
    result
}

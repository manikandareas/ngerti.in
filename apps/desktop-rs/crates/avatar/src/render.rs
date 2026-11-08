use crate::{AvatarConfig, Face, Frame, Material, State, face_for_state};
use std::fmt::Write;

const HEADER: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" fill="none">"#;

/// Adapter for the pinned resvg 0.46.0 rasterizer, never for SVG downloads.
/// filter/mod.rs scales displacement by fe.scale(), then
/// filter/displacement_map.rs multiplies by fe.scale() again. Feeding sqrt(5)
/// restores the authored five-unit displacement. Only our exact authored filter
/// changes; original SVG export and recipes stay intact. Revalidate on upgrades.
pub fn svg_for_resvg_0_46(source: &str) -> String {
    source.replace(
        r#"scale="5" xChannelSelector="R" yChannelSelector="G""#,
        r#"scale="2.23606797749979" xChannelSelector="R" yChannelSelector="G""#,
    )
}

#[derive(Clone, Copy, Debug)]
pub struct RenderOptions {
    pub state: State,
    pub shadow: bool,
    pub frame: Frame,
}
impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            state: State::Idle,
            shadow: false,
            frame: Frame::default(),
        }
    }
}
fn template(source: &str, material: &Material) -> String {
    let [light, base, shade] = material.color.palette();
    source
        .replace("$PATH", material.shape.path())
        .replace("$BASE", base)
        .replace("$SHADE", shade)
        .replace("$LIGHT", light)
        .replace(
            "$FACE_Y",
            &((material.shape.face_y() - 100.) * 0.65).to_string(),
        )
}
fn definitions(material: &Material) -> String {
    template(include_str!("templates/defs.svg"), material)
}
fn surface(material: &Material) -> String {
    let mut s = format!(
        r##"<g data-avatar-surface=""><path d="{}" fill="url(#avatar-clay)" filter="url(#avatar-fuzz)"/><path d="{}" fill="url(#avatar-sheen)"/><g mask="url(#avatar-fur-mask)">"##,
        material.shape.path(),
        material.shape.path()
    );
    let shade = material.color.palette()[2];
    for f in &material.fibers {
        write!(s, r#"<path d="M{:.2} {:.2}q{:.2} {:.2} {:.2} {:.2}" stroke="{}" stroke-opacity="{}" stroke-width="{}" stroke-linecap="round"/>"#,
            f.x, f.y, f.cx, f.cy, f.dx, f.dy, if f.light { "#fff7e8" } else { shade }, f.opacity, f.width).expect("String write");
    }
    s.push_str("</g></g>");
    s
}
pub fn render_surface_svg(material: &Material) -> String {
    format!(
        "{HEADER}{}{}{}",
        definitions(material),
        surface(material),
        "</svg>"
    )
}

/// Exact original eye shapes, gradient and contact/inset shadow. This layer has
/// no fur paths and can be drawn independently of the cached surface.
pub fn eye_svg(material: &Material, face: Face, right: bool) -> String {
    format!(
        "{HEADER}{}{}{}</svg>",
        definitions(material),
        "<g transform=\"translate(100 100)\">",
        eye(material.identity.spacing, face, right, 1., 1.)
    )
    .replace("</svg>", "</g></svg>")
}
fn eye_design(face: Face, right: bool) -> (String, f64, f64) {
    let side = if right { 1. } else { -1. };
    let mut tilt = side * 7.;
    let mut lift = 0.;
    let pill = |w: f64, h: f64| {
        format!(
            r#"<rect x="{}" y="{}" width="{w}" height="{h}" rx="{}"/>"#,
            -w / 2.,
            -h / 2.,
            w / 2.
        )
    };
    let shape = match face {
        Face::Happy => {
            tilt = side * -8.;
            r#"<path d="M-7 3 Q0-9 7 3" fill="none" stroke-width="4.5" stroke-linecap="round"/>"#
                .into()
        }
        Face::Excited => {
            tilt = 0.;
            lift = -2.;
            format!(
                r#"<path d="M{}-7 L{} 0 L{} 7" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>"#,
                side * 6.,
                side * -3.,
                side * 6.
            )
        }
        Face::Curious => {
            lift = if right { -4. } else { 2. };
            tilt = if right { 16. } else { 0. };
            pill(if right { 12. } else { 8. }, if right { 22. } else { 13. })
        }
        Face::Shy => {
            tilt = side * -22.;
            lift = 5.;
            pill(8., 11.)
        }
        Face::Surprised => {
            tilt = 0.;
            lift = -2.;
            "<ellipse rx=\"7.5\" ry=\"12\"/>".into()
        }
        Face::Sleepy => {
            tilt = side * 8.;
            lift = 3.;
            r#"<path d="M-7-1 Q0 6 7-1" fill="none" stroke-width="3.8" stroke-linecap="round"/>"#
                .into()
        }
        Face::Focused => {
            tilt = 0.;
            format!(
                r#"<path d="M-6 {} L6 {} L6 3 Q0 7-6 3Z"/>"#,
                if right { -1 } else { -5 },
                if right { -5 } else { -1 }
            )
        }
        Face::Calm => pill(10., 17.),
    };
    (shape, tilt, lift)
}
fn eye(spacing: f64, face: Face, right: bool, sx: f64, sy: f64) -> String {
    let x = if right { spacing } else { -spacing };
    let (shape, tilt, lift) = eye_design(face, right);
    format!(
        r#"<g transform="translate({x} {lift}) rotate({tilt}) scale(1.4)"><g data-avatar-eye="{}" transform="scale({sx:.3} {sy:.3})" filter="url(#avatar-eye-shadow)"><g fill="url(#avatar-eye-color)" stroke="url(#avatar-eye-color)" stroke-width="0">{shape}</g></g></g>"#,
        if right { "right" } else { "left" }
    )
}
fn rings(material: &Material, front: bool, offset: f64) -> String {
    let [light, base, shade] = material.color.palette();
    let accent = match material.color {
        crate::Color::Lilac
        | crate::Color::Iris
        | crate::Color::Lavender
        | crate::Color::Wisteria
        | crate::Color::Rose
        | crate::Color::Blush => "#d9b36d",
        _ => "#8b6bc3",
    };
    let layer = if front { "front" } else { "back" };
    let mut s = format!(
        r#"<g data-avatar-loading-rings="{layer}"><defs><clipPath id="avatar-loading-{layer}"><rect x="0" y="{}" width="200" height="100"/></clipPath></defs>"#,
        if front { 100 } else { 0 }
    );
    for (i, angle) in [-58, 58, 8].iter().enumerate() {
        write!(s,r#"<g transform="rotate({angle} 100 100)"><g clip-path="url(#avatar-loading-{layer})" fill="none"><ellipse cx="100" cy="100" rx="89" ry="35" stroke="{shade}" stroke-width="4" opacity=".25"/><ellipse cx="100" cy="100" rx="89" ry="35" stroke="{}" stroke-width="2.5"/><ellipse cx="100" cy="99.5" rx="89" ry="35" stroke="{light}" stroke-width=".6" stroke-dasharray=".6 1.1" opacity=".8"/><ellipse data-avatar-loading-ring="" cx="100" cy="100" rx="89" ry="35" pathLength="100" stroke="{light}" stroke-width="1" stroke-dasharray="{}" stroke-dashoffset="{offset}"/></g></g>"#, [base, shade, accent][i], ["18 82", "18 32 8 42", "30 70"][i]).expect("String write");
    }
    s.push_str("</g>");
    s
}

/// Standalone transparent export; all SVG strings come from validated enums and
/// seeded numeric geometry. Seeds never become markup, IDs, paths or URLs.
pub fn render_avatar_svg(
    config: &AvatarConfig,
    material: &Material,
    options: RenderOptions,
) -> Result<String, &'static str> {
    render(config, material, options, None)
}

/// Cached material pixels replace only the fur surface. Eyes, pose and ornaments
/// are generated by Rust per frame; no external resources are accepted.
pub fn render_avatar_with_texture_svg(
    config: &AvatarConfig,
    material: &Material,
    options: RenderOptions,
    png_data_uri: &str,
) -> Result<String, &'static str> {
    let data = png_data_uri
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid avatar texture.")?;
    if data.is_empty()
        || data.len() > 24 * 1024 * 1024
        || !data
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"+/=".contains(&c))
    {
        return Err("Invalid avatar texture.");
    }
    render(config, material, options, Some(png_data_uri))
}

fn render(
    config: &AvatarConfig,
    material: &Material,
    options: RenderOptions,
    texture: Option<&str>,
) -> Result<String, &'static str> {
    config.validate()?;
    if !material.matches(config) {
        return Err("Avatar material does not match the recipe.");
    }
    let mut s = format!("{HEADER}{}", definitions(material));
    let p = options.frame.pose;
    let i = material.identity;
    if options.shadow {
        write!(s,r#"<ellipse cx="100" cy="181" rx="{}" ry="9" fill="url(#avatar-ground)" opacity="{}"/>"#, 60. + p.y / 2., (1. + p.y / 45.).max(0.2)).expect("String write");
    }
    write!(s, r#"<g data-avatar-body="" transform="translate({:.2} {:.2}) translate(100 130) rotate({:.2}) scale({:.3} {:.3}) translate(-100 -130)">"#,p.x,p.y,p.rotation,p.scale_x,p.scale_y).expect("String write");
    if let Some(l) = options.frame.loading {
        s.push_str(&rings(material, false, l.ring_offset));
    }
    let surface = texture.map_or_else(
        || surface(material),
        |href| {
            format!(
                r#"<g data-avatar-surface=""><image href="{href}" width="200" height="200"/></g>"#
            )
        },
    );
    write!(s, r#"<g transform="translate(100 110) rotate({}) scale({} {}) translate(-100 -110)">{}<g transform="translate(100 {})"><g data-avatar-gaze="" transform="translate({:.2} {:.2})">"#,i.lean,i.width,i.height,surface,material.shape.face_y(),p.gaze_x * 13.,p.gaze_y * 8.).expect("String write");
    let face = options
        .frame
        .loading
        .map_or_else(|| face_for_state(config.face, options.state), |l| l.face);
    s.push_str(&eye(
        i.spacing,
        face,
        false,
        1. - options.frame.head_x.max(0.) * 0.18,
        p.eye_left,
    ));
    s.push_str(&eye(
        i.spacing,
        face,
        true,
        1. + options.frame.head_x.min(0.) * 0.18,
        p.eye_right,
    ));
    s.push_str("</g></g>");
    if let Some(l) = options.frame.loading {
        s.push_str(
            &template(include_str!("templates/veins.svg"), material).replacen(
                "opacity=\".45\"",
                &format!("opacity=\"{}\"", l.vein_opacity),
                1,
            ),
        );
    }
    s.push_str("</g>");
    if let Some(l) = options.frame.loading {
        s.push_str(&rings(material, true, l.ring_offset));
    }
    s.push_str("</g></svg>");
    Ok(s)
}

/// Unpositioned eye artwork. Native adapters cache these sixteen glyphs once;
/// placement, head perspective and independent blinking remain dynamic.
pub struct EyeGlyph {
    pub svg: String,
    pub tilt: f64,
    pub lift: f64,
}
pub fn eye_glyph(face: Face, right: bool) -> EyeGlyph {
    let (shape, tilt, lift) = eye_design(face, right);
    let defs = include_str!("templates/defs.svg");
    let start = defs
        .find("<filter id=\"avatar-eye-shadow\"")
        .expect("Eye filter template");
    let color = defs
        .find("<radialGradient id=\"avatar-eye-color\"")
        .expect("Eye gradient template");
    let end = color
        + defs[color..]
            .find("</radialGradient>")
            .expect("Eye gradient end")
        + "</radialGradient>".len();
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="-32 -32 64 64"><defs>{}</defs><g filter="url(#avatar-eye-shadow)"><g fill="url(#avatar-eye-color)" stroke="url(#avatar-eye-color)" stroke-width="0">{shape}</g></g></svg>"#,
        &defs[start..end]
    );
    EyeGlyph { svg, tilt, lift }
}

/// Only the back rings or the front veins/rings. Fur and eyes stay independent.
pub fn loading_layer_svg(material: &Material, frame: Frame, front: bool) -> Option<String> {
    let loading = frame.loading?;
    let p = frame.pose;
    let i = material.identity;
    let mut svg = format!("{HEADER}{}", definitions(material));
    write!(svg,r#"<g transform="translate({:.2} {:.2}) translate(100 130) rotate({:.2}) scale({:.3} {:.3}) translate(-100 -130)">"#,p.x,p.y,p.rotation,p.scale_x,p.scale_y).expect("String write");
    if front {
        write!(
            svg,
            r#"<g transform="translate(100 110) rotate({}) scale({} {}) translate(-100 -110)">"#,
            i.lean, i.width, i.height
        )
        .expect("String write");
        svg.push_str(
            &template(include_str!("templates/veins.svg"), material).replacen(
                "opacity=\".45\"",
                &format!("opacity=\"{}\"", loading.vein_opacity),
                1,
            ),
        );
        svg.push_str("</g>");
    }
    svg.push_str(&rings(material, front, loading.ring_offset));
    svg.push_str("</g></svg>");
    Some(svg)
}

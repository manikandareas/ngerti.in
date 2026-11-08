//! Cross-language fixtures are generated from the frozen, unmodified web renderer.
use ngertiin_avatar::*;
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fmt::Write;

fn reference() -> Value {
    serde_json::from_str(include_str!(
        "../../../verification/nma-067/avatar-reference.json"
    ))
    .unwrap()
}
fn equivalent(actual: impl Serialize, expected: &Value) {
    fn compare(actual: &Value, expected: &Value, path: &str) {
        match (actual, expected) {
            (Value::Number(a), Value::Number(b)) => assert!(
                (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < 1e-10,
                "{path}: {a} != {b}"
            ),
            (Value::Object(a), Value::Object(b)) => {
                assert_eq!(a.len(), b.len(), "{path}");
                for (key, v) in b {
                    compare(&a[key], v, &format!("{path}.{key}"));
                }
            }
            _ => assert_eq!(actual, expected, "{path}"),
        }
    }
    compare(&serde_json::to_value(actual).unwrap(), expected, "value");
}
#[test]
fn all_recipes_random_identity_and_every_fiber_match_web_oracle() {
    let oracle = reference();
    for shape in Shape::ALL {
        let name = serde_json::to_value(shape).unwrap();
        let expected = &oracle["catalog"]["shapes"][name.as_str().unwrap()];
        assert_eq!(shape.path(), expected["path"].as_str().unwrap());
        assert_eq!(shape.face_y(), expected["faceY"].as_f64().unwrap());
    }
    for color in Color::ALL {
        let name = serde_json::to_value(color).unwrap();
        let expected = &oracle["catalog"]["colors"][name.as_str().unwrap()];
        assert_eq!(
            color.palette(),
            [
                expected["light"].as_str().unwrap(),
                expected["base"].as_str().unwrap(),
                expected["shade"].as_str().unwrap()
            ]
        );
    }
    for case in reference()["cases"].as_array().unwrap() {
        let config: AvatarConfig = serde_json::from_value(case["recipe"].clone()).unwrap();
        assert_eq!(
            u64::from(seed_hash(&config.seed)),
            case["hash"].as_u64().unwrap()
        );
        let mut rng = SeedRandom::new(&config.seed);
        for value in case["samples"].as_array().unwrap() {
            assert!((rng.sample() - value.as_f64().unwrap()).abs() < 1e-15);
        }
        equivalent(
            AvatarConfig::create(&config.seed, AvatarOverrides::default()).unwrap(),
            &case["created"],
        );
        let material = Material::new(&config).unwrap();
        equivalent(material.identity, &case["identity"]);
        let mut canonical = String::new();
        let zero = |v: f64| if v == 0. { 0. } else { v };
        for f in &material.fibers {
            writeln!(
                canonical,
                "{:.2},{:.2},{:.2},{:.2},{:.2},{:.2},{},{:.10},{:.2}",
                zero(f.x),
                zero(f.y),
                zero(f.cx),
                zero(f.cy),
                zero(f.dx),
                zero(f.dy),
                u8::from(f.light),
                f.opacity,
                f.width
            )
            .unwrap();
        }
        assert_eq!(
            format!("{:x}", Sha256::digest(canonical)),
            case["fiberDigest"].as_str().unwrap(),
            "seed {}",
            config.seed
        );
        for sample in case["fibers"].as_array().unwrap() {
            let mut expected = sample.clone();
            let index = expected
                .as_object_mut()
                .unwrap()
                .remove("index")
                .unwrap()
                .as_u64()
                .unwrap() as usize;
            equivalent(material.fibers[index], &expected);
        }
    }
}
#[test]
fn parse_version_unicode_length_and_legacy_colors_match_web() {
    for case in reference()["parseCases"].as_array().unwrap() {
        assert_eq!(
            serde_json::from_value::<AvatarConfig>(case["value"].clone()).is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["value"]
        );
    }
    let base = json!({"version":1.0,"seed":"🌿","shape":"circle","color":"butter","face":"happy","extra":"ignored"});
    assert!(serde_json::from_value::<AvatarConfig>(base).is_ok());
    for i in 0..512 {
        let config =
            AvatarConfig::create(&format!("generated-{i}"), AvatarOverrides::default()).unwrap();
        assert!(Color::SELECTABLE.contains(&config.color));
    }
    assert_eq!(
        AvatarConfig::default_agent("ignored", true).unwrap().color,
        Color::Lilac
    );
}
#[test]
fn states_actions_blinks_and_loading_match_fixed_web_timestamps() {
    let r = reference();
    for case in r["poses"].as_array().unwrap() {
        equivalent(
            sample_pose(
                case["time"].as_f64().unwrap(),
                serde_json::from_value(case["state"].clone()).unwrap(),
                None,
                case["reduced"].as_bool().unwrap(),
            ),
            &case["pose"],
        );
    }
    for case in r["actions"].as_array().unwrap() {
        equivalent(
            sample_pose(
                3400.,
                State::Idle,
                Some((
                    serde_json::from_value(case["action"].clone()).unwrap(),
                    case["progress"].as_f64().unwrap(),
                )),
                false,
            ),
            &case["pose"],
        );
    }
    for case in r["loading"].as_array().unwrap() {
        equivalent(
            sample_loading(
                case["time"].as_f64().unwrap(),
                case["reduced"].as_bool().unwrap(),
            ),
            &case["sample"],
        );
    }
    for case in r["faceMapping"].as_array().unwrap() {
        equivalent(
            face_for_state(
                serde_json::from_value(case["face"].clone()).unwrap(),
                serde_json::from_value(case["state"].clone()).unwrap(),
            ),
            &case["result"],
        );
    }
}
#[test]
fn material_cache_is_bounded_shared_across_faces_and_validates_every_hit() {
    let mut cache = MaterialCache::new(2);
    let mut config = AvatarConfig::default_agent("x", true).unwrap();
    let material = cache.get(&config).unwrap();
    config.face = Face::Happy;
    assert!(std::sync::Arc::ptr_eq(
        &material,
        &cache.get(&config).unwrap()
    ));
    config.seed = "second".into();
    cache.get(&config).unwrap();
    config.seed = "third".into();
    cache.get(&config).unwrap();
    assert_eq!(cache.len(), 2);
    config.seed = "tobi-circle".into();
    assert!(!std::sync::Arc::ptr_eq(
        &material,
        &cache.get(&config).unwrap()
    ));
    config.version = 2;
    assert!(cache.get(&config).is_err());
}
#[test]
fn export_keeps_original_filters_has_no_user_markup_and_rejects_mismatched_material() {
    let config = AvatarConfig::create("<script>&\"'", AvatarOverrides::default()).unwrap();
    let material = Material::new(&config).unwrap();
    let svg = render_avatar_svg(&config, &material, RenderOptions::default()).unwrap();
    assert!(!svg.contains(&config.seed));
    assert!(!svg.contains("<image"));
    assert!(!svg.contains("<rect width=\"200\""));
    assert!(svg.contains("feTurbulence"));
    assert!(svg.contains("inset-shadow"));
    assert!(svg.contains("contact-shadow"));
    assert_eq!(material.fibers.len(), 8500);
    let mut other = config.clone();
    other.seed = "different".into();
    assert!(render_avatar_svg(&other, &material, RenderOptions::default()).is_err());
    assert!(!eye_svg(&material, Face::Calm, false).contains("stroke-opacity"));
    assert!(
        render_avatar_with_texture_svg(
            &config,
            &material,
            RenderOptions::default(),
            "https://example.com/image.png"
        )
        .is_err()
    );
    assert!(
        render_avatar_with_texture_svg(
            &config,
            &material,
            RenderOptions::default(),
            "data:image/png;base64,\"/><script>"
        )
        .is_err()
    );
}
#[test]
fn original_svg_and_rust_export_have_matching_transparent_pixels_with_eye_shadows() {
    fn raster(source: &str, size: u32) -> resvg::tiny_skia::Pixmap {
        let tree = resvg::usvg::Tree::from_str(source, &resvg::usvg::Options::default()).unwrap();
        let mut pixmap = resvg::tiny_skia::Pixmap::new(size, size).unwrap();
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(size as f32 / 200., size as f32 / 200.),
            &mut pixmap.as_mut(),
        );
        pixmap
    }
    let config = AvatarConfig::default_agent("ignored", true).unwrap();
    let material = Material::new(&config).unwrap();
    let svg = render_avatar_svg(&config, &material, RenderOptions::default()).unwrap();
    for edge in [64, 256, 768] {
        let actual = raster(&svg, edge);
        let reference = raster(
            include_str!("../../../verification/nma-067/reference-tobi.svg"),
            edge,
        );
        let maximum = actual
            .data()
            .iter()
            .zip(reference.data())
            .map(|(a, b)| a.abs_diff(*b))
            .max()
            .unwrap();
        assert_eq!(maximum, 0, "Raster difference at {edge}px");
        assert_eq!(actual.pixel(0, 0).unwrap().alpha(), 0, "Transparent corner");
        assert!(actual.pixels().iter().any(|p| p.alpha() > 0));
    }
}
#[test]
fn pinned_raster_adapter_restores_five_unit_displacement_without_changing_exports() {
    // A constant white displacement map moves source sampling +2.5 units on
    // each axis, moving this opaque square's painted start from 40 to 37.
    let original = r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feFlood flood-color="white" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect x="40" y="40" width="80" height="80" fill="red" filter="url(#f)"/></svg>"#;
    let adapted = svg_for_resvg_0_46(original);
    assert!(original.contains("scale=\"5\""));
    assert!(!adapted.contains("scale=\"5\""));
    let render = |s: &str| {
        let tree = resvg::usvg::Tree::from_str(s, &resvg::usvg::Options::default()).unwrap();
        let mut pixels = resvg::tiny_skia::Pixmap::new(200, 200).unwrap();
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::identity(),
            &mut pixels.as_mut(),
        );
        pixels
    };
    let actual = render(&adapted);
    let first_x = (0..200)
        .find(|x| actual.pixel(*x, 60).unwrap().alpha() > 0)
        .unwrap();
    assert_eq!(first_x, 37);
    assert!(
        render(original).pixel(30, 60).unwrap().alpha() > 0,
        "Unadapted pin reproduces excessive displacement"
    );
    let config = AvatarConfig::default_agent("ignored", true).unwrap();
    let svg = render_avatar_svg(
        &config,
        &Material::new(&config).unwrap(),
        RenderOptions::default(),
    )
    .unwrap();
    assert!(
        svg.contains("scale=\"5\""),
        "Original transparent SVG stays unchanged"
    );
}
#[test]
fn clock_suspends_and_resumes_with_bounded_smoothing_and_reduced_motion() {
    let mut clock = MotionClock::default();
    clock.look_at(Some((1., -1.)));
    let first = clock
        .sample(1000., 0, State::Idle, true, false, false)
        .unwrap();
    assert!(first.pose.gaze_x > 0. && first.pose.gaze_x < 1.);
    assert!(
        clock
            .sample(1100., 0, State::Idle, false, false, false)
            .is_none()
    );
    let reduced = clock
        .sample(100000., 0, State::Idle, true, true, false)
        .unwrap();
    equivalent(
        reduced.pose,
        &serde_json::to_value(Pose::default()).unwrap(),
    );
    clock.set_loading(true, 100000.);
    let loading = clock
        .sample(100010., 0, State::Thinking, true, true, false)
        .unwrap();
    assert_eq!(loading.loading.unwrap().vein_opacity, 0.45);
    clock.set_loading(false, 100020.);
    clock.play(Action::Wink, 100020.);
    assert!(
        clock
            .sample(100345., 0, State::Idle, true, false, true)
            .unwrap()
            .pose
            .eye_right
            < 0.1
    );
    assert!(
        clock
            .sample(f64::NAN, 0, State::Idle, true, false, false)
            .is_none()
    );
}

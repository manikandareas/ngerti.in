//! Renderer-independent seeds and a bounded texture-transform proof.
//! The complete recipe/geometry/motion port belongs to NMA-067.

/// Matches packages/avatar seedHash, including Unicode code points and u32 wrapping.
pub fn seed_hash(seed: &str) -> u32 {
    seed.chars().fold(2_166_136_261, |hash, ch| {
        (hash ^ ch as u32).wrapping_mul(16_777_619)
    })
}

pub struct SeedRandom(u32);
impl SeedRandom {
    pub fn new(seed: &str) -> Self {
        Self(seed_hash(seed))
    }
    pub fn sample(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut n = (self.0 ^ (self.0 >> 15)).wrapping_mul(1 | self.0);
        n ^= n.wrapping_add((n ^ (n >> 7)).wrapping_mul(61 | n));
        f64::from(n ^ (n >> 14)) / 4_294_967_296.
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seed_matches_javascript_vectors() {
        assert_eq!(seed_hash("tobi-circle"), 3_331_797_016);
        assert_eq!(seed_hash(""), 2_166_136_261);
        assert_eq!(seed_hash("🌿a"), 1_458_192_701);
        let mut random = SeedRandom::new("tobi-circle");
        assert_eq!(random.sample(), 0.9050258086062968);
        assert_eq!(random.sample(), 0.12857843260280788);
    }
    #[test]
    fn texture_is_deterministic_and_surface_only() {
        assert_eq!(texture_svg("tobi", 0.), texture_svg("tobi", 0.));
        assert_ne!(texture_svg("tobi", 0.), texture_svg("tobi", 22.5));
        assert_ne!(texture_svg("tobi", 0.), texture_svg("kira", 0.));
        assert!(!texture_svg("tobi", 0.).contains("<image"));
    }
}

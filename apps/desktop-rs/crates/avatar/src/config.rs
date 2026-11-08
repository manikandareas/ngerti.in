use crate::{Color, Face, Shape};
use serde::{Deserialize, Deserializer, Serialize, de::Error as _};

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub struct AvatarConfig {
    pub version: u8,
    pub seed: String,
    pub shape: Shape,
    pub color: Color,
    pub face: Face,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AvatarOverrides {
    pub shape: Option<Shape>,
    pub color: Option<Color>,
    pub face: Option<Face>,
}

impl<'de> Deserialize<'de> for AvatarConfig {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Recipe {
            version: f64,
            seed: String,
            shape: Shape,
            color: Color,
            face: Face,
        }
        let r = Recipe::deserialize(deserializer)?;
        if r.version != 1. {
            return Err(D::Error::custom("Invalid avatar recipe."));
        }
        let config = Self {
            version: 1,
            seed: r.seed,
            shape: r.shape,
            color: r.color,
            face: r.face,
        };
        config.validate().map_err(D::Error::custom)?;
        Ok(config)
    }
}

impl AvatarConfig {
    pub fn validate(&self) -> Result<(), &'static str> {
        // JavaScript String.length counts UTF-16 units, not scalar values or bytes.
        if self.version != 1 || !(1..=128).contains(&self.seed.encode_utf16().count()) {
            return Err("Invalid avatar recipe.");
        }
        Ok(())
    }
    pub fn create(seed: &str, overrides: AvatarOverrides) -> Result<Self, &'static str> {
        let mut rng = SeedRandom::new(seed);
        // Consume every pick before applying overrides, matching the stored identity contract.
        let shape = Shape::ALL[(rng.sample() * Shape::ALL.len() as f64) as usize];
        let color = Color::SELECTABLE[(rng.sample() * Color::SELECTABLE.len() as f64) as usize];
        let face = Face::ALL[(rng.sample() * Face::ALL.len() as f64) as usize];
        let config = Self {
            version: 1,
            seed: seed.into(),
            shape: overrides.shape.unwrap_or(shape),
            color: overrides.color.unwrap_or(color),
            face: overrides.face.unwrap_or(face),
        };
        config.validate()?;
        Ok(config)
    }
    pub fn default_agent(id: &str, tobi: bool) -> Result<Self, &'static str> {
        Self::create(
            if tobi { "tobi-circle" } else { id },
            if tobi {
                AvatarOverrides {
                    shape: Some(Shape::Circle),
                    color: Some(Color::Lilac),
                    face: Some(Face::Calm),
                }
            } else {
                AvatarOverrides::default()
            },
        )
    }
}

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

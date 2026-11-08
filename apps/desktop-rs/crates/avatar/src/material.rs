use crate::{AvatarConfig, Color, SeedRandom, Shape};
use serde::Serialize;
use std::{collections::VecDeque, sync::Arc};

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Identity {
    pub spacing: f64,
    pub lean: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Clone, Copy, Debug, Serialize)]
pub struct Fiber {
    pub x: f64,
    pub y: f64,
    pub cx: f64,
    pub cy: f64,
    pub dx: f64,
    pub dy: f64,
    pub light: bool,
    pub opacity: f64,
    pub width: f64,
}
#[derive(Debug)]
pub struct Material {
    seed: String,
    pub shape: Shape,
    pub color: Color,
    pub identity: Identity,
    pub fibers: Vec<Fiber>,
}
fn fixed(value: f64, precision: usize) -> f64 {
    format!("{value:.precision$}")
        .parse()
        .expect("Finite seeded value")
}
impl Material {
    pub fn new(config: &AvatarConfig) -> Result<Self, &'static str> {
        config.validate()?;
        let mut rng = SeedRandom::new(&config.seed);
        let identity = Identity {
            spacing: fixed(16. + rng.sample() * 5., 2),
            lean: fixed((rng.sample() - 0.5) * 5., 2),
            width: fixed(0.96 + rng.sample() * 0.08, 3),
            height: fixed(0.97 + rng.sample() * 0.06, 3),
        };
        rng.sample();
        let fibers = (0..8500)
            .map(|index| {
                let x = 15. + rng.sample() * 170.;
                let y = 15. + rng.sample() * 170.;
                let angle = (y - 72.).atan2((x - 90.) * 0.85) + (y / 17. + x / 23.).sin() * 0.35;
                let length = if index < 5500 {
                    1.5 + rng.sample() * 3.
                } else {
                    4. + rng.sample() * 7.
                };
                let dx = angle.cos() * length;
                let dy = angle.sin() * length;
                let light = rng.sample() > 0.45;
                Fiber {
                    x: fixed(x, 2),
                    y: fixed(y, 2),
                    cx: fixed(dx * 0.35 - dy * 0.16, 2),
                    cy: fixed(dy * 0.35 + dx * 0.16, 2),
                    dx: fixed(dx, 2),
                    dy: fixed(dy, 2),
                    light,
                    opacity: if light {
                        0.12 + rng.sample() * 0.25
                    } else {
                        0.2 + rng.sample() * 0.3
                    },
                    width: if index < 5500 { 0.24 } else { 0.36 },
                }
            })
            .collect();
        Ok(Self {
            seed: config.seed.clone(),
            shape: config.shape,
            color: config.color,
            identity,
            fibers,
        })
    }
    pub fn matches(&self, config: &AvatarConfig) -> bool {
        self.seed == config.seed && self.shape == config.shape && self.color == config.color
    }
}

/// Caller-owned LRU; face/state do not invalidate material. Maximum 16 identities,
/// each with exactly 8,500 bounded fibers. Generate on a background worker.
pub struct MaterialCache {
    entries: VecDeque<(String, Shape, Color, Arc<Material>)>,
    capacity: usize,
}
impl Default for MaterialCache {
    fn default() -> Self {
        Self::new(16)
    }
}
impl MaterialCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            capacity: capacity.min(16),
        }
    }
    pub fn get(&mut self, config: &AvatarConfig) -> Result<Arc<Material>, &'static str> {
        config.validate()?;
        if let Some(i) = self
            .entries
            .iter()
            .position(|(s, h, c, _)| s == &config.seed && *h == config.shape && *c == config.color)
        {
            let entry = self.entries.remove(i).expect("Existing LRU entry");
            let material = entry.3.clone();
            self.entries.push_back(entry);
            return Ok(material);
        }
        let material = Arc::new(Material::new(config)?);
        if self.capacity > 0 {
            if self.entries.len() == self.capacity {
                self.entries.pop_front();
            }
            self.entries.push_back((
                config.seed.clone(),
                config.shape,
                config.color,
                material.clone(),
            ));
        }
        Ok(material)
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

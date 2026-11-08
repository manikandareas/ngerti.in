//! Bounded, layer-based native avatar compositor. Fur and eye filters are prepared
//! once; every live frame transforms cached pixels instead of parsing full portraits.
use futures_channel::oneshot;
use gpui_kit::*;
use ngertiin_avatar::*;
use resvg::tiny_skia::{FilterQuality, Pixmap, PixmapPaint, Transform};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, mpsc},
    time::Instant,
};

pub type AvatarReply = oneshot::Receiver<Result<Arc<RenderImage>, String>>;
pub type BatchReply = oneshot::Receiver<Result<AvatarBatch, String>>;
#[derive(Clone)]
pub struct FrameInput {
    pub config: AvatarConfig,
    pub options: RenderOptions,
    pub edge: u32,
}
#[derive(Clone, Debug, Serialize)]
pub struct FrameMetrics {
    pub frames: usize,
    pub elapsed_ms: f64,
    pub cache_misses: usize,
}
pub struct AvatarBatch {
    pub images: Vec<Arc<RenderImage>>,
    pub metrics: FrameMetrics,
}
enum Reply {
    Single(oneshot::Sender<Result<Arc<RenderImage>, String>>),
    Batch(oneshot::Sender<Result<AvatarBatch, String>>),
}
impl Reply {
    fn canceled(&self) -> bool {
        match self {
            Self::Single(s) => s.is_canceled(),
            Self::Batch(s) => s.is_canceled(),
        }
    }
}
struct Work {
    inputs: Vec<FrameInput>,
    reply: Reply,
}
#[derive(Clone)]
pub struct AvatarRenderer {
    sender: mpsc::SyncSender<Work>,
}
struct Prepared {
    material: Arc<Material>,
    surface: Pixmap,
}
struct Glyph {
    pixels: Pixmap,
    tilt: f64,
    lift: f64,
}
#[derive(Default)]
pub struct Compositor {
    materials: MaterialCache,
    textures: VecDeque<Prepared>,
    eyes: HashMap<(Face, bool), Glyph>,
}
impl AvatarRenderer {
    pub fn new() -> std::io::Result<Self> {
        let (sender, receiver) = mpsc::sync_channel::<Work>(1);
        std::thread::Builder::new()
            .name("ngertiin-avatar".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                let mut compositor = Compositor::default();
                while let Ok(work) = receiver.recv() {
                    if work.reply.canceled() {
                        continue;
                    }
                    let started = Instant::now();
                    let mut misses = 0;
                    let result = (|| -> anyhow::Result<AvatarBatch> {
                        let mut images = Vec::with_capacity(work.inputs.len());
                        for frame in &work.inputs {
                            if work.reply.canceled() {
                                anyhow::bail!("Avatar frame retired.");
                            }
                            let (pixels, miss) = compositor.frame(frame)?;
                            misses += usize::from(miss);
                            let mut bytes = pixels.data().to_vec();
                            for pixel in bytes.as_chunks_mut::<4>().0 {
                                pixel.swap(0, 2);
                            }
                            let buffer = image::RgbaImage::from_raw(frame.edge, frame.edge, bytes)
                                .ok_or_else(|| {
                                    anyhow::anyhow!("Avatar pixel buffer unavailable.")
                                })?;
                            images
                                .push(Arc::new(RenderImage::new(vec![image::Frame::new(buffer)])));
                        }
                        Ok(AvatarBatch {
                            metrics: FrameMetrics {
                                frames: images.len(),
                                elapsed_ms: started.elapsed().as_secs_f64() * 1000.,
                                cache_misses: misses,
                            },
                            images,
                        })
                    })()
                    .map_err(|e| e.to_string());
                    match work.reply {
                        Reply::Single(reply) => {
                            let _ = reply.send(result.and_then(|mut b| {
                                b.images
                                    .pop()
                                    .ok_or_else(|| "Avatar frame unavailable.".into())
                            }));
                        }
                        Reply::Batch(reply) => {
                            let _ = reply.send(result);
                        }
                    }
                }
            })?;
        Ok(Self { sender })
    }
    pub fn render(
        &self,
        config: AvatarConfig,
        options: RenderOptions,
    ) -> Result<AvatarReply, &'static str> {
        let (reply, receiver) = oneshot::channel();
        self.sender
            .try_send(Work {
                inputs: vec![FrameInput {
                    config,
                    options,
                    edge: 512,
                }],
                reply: Reply::Single(reply),
            })
            .map_err(|_| "Avatar renderer is busy. Retry the frame.")?;
        Ok(receiver)
    }
    pub fn batch(&self, inputs: Vec<FrameInput>) -> Result<BatchReply, &'static str> {
        if inputs.is_empty() || inputs.len() > 30 {
            return Err("Avatar frame batch must contain 1–30 visible portraits.");
        }
        let (reply, receiver) = oneshot::channel();
        self.sender
            .try_send(Work {
                inputs,
                reply: Reply::Batch(reply),
            })
            .map_err(|_| "Avatar renderer is busy.")?;
        Ok(receiver)
    }
}
impl Compositor {
    pub fn frame(&mut self, input: &FrameInput) -> anyhow::Result<(Pixmap, bool)> {
        anyhow::ensure!(
            (32..=768).contains(&input.edge),
            "Avatar raster size is outside the supported range."
        );
        input.config.validate().map_err(anyhow::Error::msg)?;
        let texture_edge = input.edge.next_power_of_two().clamp(256, 768);
        let cached = self
            .textures
            .iter()
            .position(|t| t.material.matches(&input.config) && t.surface.width() == texture_edge);
        let miss = cached.is_none();
        let prepared = if let Some(i) = cached {
            self.textures.remove(i).expect("Cached material")
        } else {
            let material = self
                .materials
                .get(&input.config)
                .map_err(anyhow::Error::msg)?;
            let surface = raster(&render_surface_svg(&material), texture_edge)?;
            Prepared { material, surface }
        };
        let face = input.options.frame.loading.map_or_else(
            || face_for_state(input.config.face, input.options.state),
            |l| l.face,
        );
        for right in [false, true] {
            if let std::collections::hash_map::Entry::Vacant(entry) = self.eyes.entry((face, right))
            {
                let glyph = eye_glyph(face, right);
                entry.insert(Glyph {
                    pixels: raster(&glyph.svg, 256)?,
                    tilt: glyph.tilt,
                    lift: glyph.lift,
                });
            }
        }
        let pixels = compose(&prepared, &self.eyes, input, face)?;
        if self.textures.len() == 32 {
            self.textures.pop_front();
        }
        self.textures.push_back(prepared);
        Ok((pixels, miss))
    }
}
#[derive(Clone, Copy)]
struct Matrix([f32; 6]);
impl Matrix {
    fn translate(x: f64, y: f64) -> Self {
        Self([1., 0., 0., 1., x as f32, y as f32])
    }
    fn scale(x: f64, y: f64) -> Self {
        Self([x as f32, 0., 0., y as f32, 0., 0.])
    }
    fn rotate(degrees: f64) -> Self {
        let (s, c) = degrees.to_radians().sin_cos();
        Self([c as f32, s as f32, -s as f32, c as f32, 0., 0.])
    }
    fn then(self, b: Self) -> Self {
        let a = self.0;
        let b = b.0;
        Self([
            a[0] * b[0] + a[2] * b[1],
            a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4],
            a[1] * b[4] + a[3] * b[5] + a[5],
        ])
    }
    fn transform(self) -> Transform {
        let a = self.0;
        Transform::from_row(a[0], a[1], a[2], a[3], a[4], a[5])
    }
}
fn compose(
    prepared: &Prepared,
    eyes: &HashMap<(Face, bool), Glyph>,
    input: &FrameInput,
    face: Face,
) -> anyhow::Result<Pixmap> {
    let frame = input.options.frame;
    let p = frame.pose;
    let i = prepared.material.identity;
    let edge = input.edge;
    let mut pixels = Pixmap::new(edge, edge)
        .ok_or_else(|| anyhow::anyhow!("Avatar pixel allocation failed."))?;
    let paint = PixmapPaint {
        quality: FilterQuality::Bilinear,
        ..Default::default()
    };
    if let Some(back) = loading_layer_svg(&prepared.material, frame, false) {
        let layer = raster(&back, edge)?;
        pixels.draw_pixmap(
            0,
            0,
            layer.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }
    let root = Matrix::scale(f64::from(edge) / 200., f64::from(edge) / 200.)
        .then(Matrix::translate(p.x, p.y))
        .then(Matrix::translate(100., 130.))
        .then(Matrix::rotate(p.rotation))
        .then(Matrix::scale(p.scale_x, p.scale_y))
        .then(Matrix::translate(-100., -130.))
        .then(Matrix::translate(100., 110.))
        .then(Matrix::rotate(i.lean))
        .then(Matrix::scale(i.width, i.height))
        .then(Matrix::translate(-100., -110.));
    let surface = root.then(Matrix::scale(
        200. / f64::from(prepared.surface.width()),
        200. / f64::from(prepared.surface.height()),
    ));
    pixels.draw_pixmap(
        0,
        0,
        prepared.surface.as_ref(),
        &paint,
        surface.transform(),
        None,
    );
    for right in [false, true] {
        let glyph = &eyes[&(face, right)];
        let head = if right {
            1. + frame.head_x.min(0.) * 0.18
        } else {
            1. - frame.head_x.max(0.) * 0.18
        };
        let transform = root
            .then(Matrix::translate(
                100. + p.gaze_x * 13.,
                prepared.material.shape.face_y() + p.gaze_y * 8.,
            ))
            .then(Matrix::translate(
                if right { i.spacing } else { -i.spacing },
                glyph.lift,
            ))
            .then(Matrix::rotate(glyph.tilt))
            .then(Matrix::scale(1.4, 1.4))
            .then(Matrix::scale(
                head,
                if right { p.eye_right } else { p.eye_left },
            ))
            .then(Matrix::translate(-32., -32.))
            .then(Matrix::scale(64. / 256., 64. / 256.));
        pixels.draw_pixmap(
            0,
            0,
            glyph.pixels.as_ref(),
            &paint,
            transform.transform(),
            None,
        );
    }
    if let Some(front) = loading_layer_svg(&prepared.material, frame, true) {
        let layer = raster(&front, edge)?;
        pixels.draw_pixmap(
            0,
            0,
            layer.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }
    Ok(pixels)
}
pub fn raster(source: &str, edge: u32) -> anyhow::Result<Pixmap> {
    anyhow::ensure!(
        (32..=2048).contains(&edge),
        "Avatar raster size is outside the supported range."
    );
    let tree = resvg::usvg::Tree::from_str(
        &svg_for_resvg_0_46(source),
        &resvg::usvg::Options::default(),
    )?;
    let mut pixels = Pixmap::new(edge, edge)
        .ok_or_else(|| anyhow::anyhow!("Avatar pixel allocation failed."))?;
    resvg::render(
        &tree,
        Transform::from_scale(
            edge as f32 / tree.size().width(),
            edge as f32 / tree.size().height(),
        ),
        &mut pixels.as_mut(),
    );
    Ok(pixels)
}

#[cfg(test)]
mod tests {
    use super::{Compositor, FrameInput, raster};
    use ngertiin_avatar::*;
    #[test]
    fn cached_compositor_tracks_original_geometry_eyes_and_motion() {
        let mut compositor = Compositor::default();
        let mut worst = 0f64;
        for (index, face) in Face::ALL.into_iter().enumerate() {
            let mut config = AvatarConfig::default_agent("tobi", true).unwrap();
            config.face = face;
            config.shape = Shape::ALL[index];
            let mut cases = vec![];
            for state in State::ALL {
                for time in [0., 2155., 6200.] {
                    cases.push((
                        format!("{state:?} at {time}"),
                        RenderOptions {
                            state,
                            shadow: false,
                            frame: sample_frame(time, state, None, false, false),
                        },
                    ));
                }
            }
            for action in Action::ALL {
                for progress in [0., 0.5, 1.] {
                    cases.push((
                        format!("{action:?} at {progress}"),
                        RenderOptions {
                            state: State::Idle,
                            shadow: false,
                            frame: sample_frame(
                                600.,
                                State::Idle,
                                Some((action, progress)),
                                false,
                                false,
                            ),
                        },
                    ));
                }
            }
            for reduced in [false, true] {
                for time in [0., 600., 2400.] {
                    cases.push((
                        format!("Loading at {time}, reduced={reduced}"),
                        RenderOptions {
                            state: State::Working,
                            shadow: false,
                            frame: sample_frame(time, State::Working, None, reduced, true),
                        },
                    ));
                }
            }
            for (case_index, (label, options)) in cases.into_iter().enumerate() {
                let (actual, miss) = compositor
                    .frame(&FrameInput {
                        config: config.clone(),
                        options,
                        edge: 256,
                    })
                    .unwrap();
                assert_eq!(miss, case_index == 0);
                let material = Material::new(&config).unwrap();
                let expected = raster(
                    &render_avatar_svg(&config, &material, options).unwrap(),
                    256,
                )
                .unwrap();
                let mean = actual
                    .data()
                    .iter()
                    .zip(expected.data())
                    .map(|(a, b)| f64::from(a.abs_diff(*b)))
                    .sum::<f64>()
                    / actual.data().len() as f64;
                worst = worst.max(mean);
                assert!(
                    mean < 5.,
                    "Cached layer diverged for {face:?}, {label}: mean {mean}"
                );
            }
        }
        eprintln!(
            "Cached avatar mean absolute channel difference, worst of 360 frames: {worst:.4}/255"
        );
        assert_eq!(compositor.eyes.len(), 16);
        assert!(compositor.textures.len() <= 32);
    }
}

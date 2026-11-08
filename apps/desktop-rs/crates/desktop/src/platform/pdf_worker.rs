//! Immutable PDF bytes, metadata and bounded native Quartz page rasters.
//! Every CoreGraphics object is created/used/dropped on this one worker.
use crate::models::content::{PDF_BYTES, PDF_PAGES};
use futures_channel::oneshot;
use gpui_kit::RenderImage;
use objc2_core_foundation::{CFData, CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGDataProvider, CGPDFBox, CGPDFDocument,
    CGPDFPage,
};
use std::{
    io::Read,
    path::PathBuf,
    sync::{Arc, mpsc},
};

pub const PAGE_PIXELS: u64 = 4_000_000;
pub const TILE_PIXELS: u64 = 512_000;
#[derive(Clone, Debug)]
pub struct PageSize {
    pub width: f64,
    pub height: f64,
    pub media: CGRect,
    pub rotation: i32,
}
impl PageSize {
    pub fn raster_size(&self, width: f64) -> (u32, u32) {
        let ratio = self.height / self.width;
        let scale = (PAGE_PIXELS as f64 / (width * width * ratio))
            .sqrt()
            .min(1.);
        let w = (width * scale).floor().max(1.) as u32;
        let h = (width * ratio * scale).floor().max(1.) as u32;
        (w, h)
    }
    pub fn to_pdf(&self, x: f64, y: f64, display_width: f64) -> (f64, f64) {
        let scale = display_width / self.width;
        let (x, y) = (x / scale, y / scale);
        let r = self.media;
        match self.rotation {
            90 => (r.origin.x + y, r.origin.y + x),
            180 => (r.origin.x + r.size.width - x, r.origin.y + y),
            270 => (
                r.origin.x + r.size.width - y,
                r.origin.y + r.size.height - x,
            ),
            _ => (r.origin.x + x, r.origin.y + r.size.height - y),
        }
    }
    pub fn display_point(&self, x: f64, y: f64, display_width: f64) -> (f64, f64) {
        let r = self.media;
        let (x, y) = (x - r.origin.x, y - r.origin.y);
        let (x, y) = match self.rotation {
            90 => (y, x),
            180 => (r.size.width - x, y),
            270 => (r.size.height - y, r.size.width - x),
            _ => (x, r.size.height - y),
        };
        let scale = display_width / self.width;
        (x * scale, y * scale)
    }
}
pub struct LoadedPdf {
    pub bytes: Arc<Vec<u8>>,
    pub pages: Vec<PageSize>,
}
pub struct PageRaster {
    pub page: usize,
    pub tiles: Vec<PageTile>,
    pub width: u32,
    pub height: u32,
}
pub struct PageTile {
    pub top: u32,
    pub height: u32,
    pub source_top: u32,
    pub source_height: u32,
    pub image: Arc<RenderImage>,
}
fn tile_page(width: u32, height: u32, pixels: &[u8]) -> anyhow::Result<Vec<PageTile>> {
    let stride = width as usize * 4;
    let band = (TILE_PIXELS / u64::from(width)).saturating_sub(2).max(1) as u32;
    (0..height)
        .step_by(band as usize)
        .map(|top| {
            let visible_height = band.min(height - top);
            let source_top = top.saturating_sub(1);
            let source_end = (top + visible_height + 1).min(height);
            let source_height = source_end - source_top;
            let bytes = pixels[source_top as usize * stride..source_end as usize * stride].to_vec();
            let buffer = image::RgbaImage::from_raw(width, source_height, bytes)
                .ok_or_else(|| anyhow::anyhow!("PDF pixels are unavailable."))?;
            Ok(PageTile {
                top,
                height: visible_height,
                source_top,
                source_height,
                image: Arc::new(RenderImage::new(vec![image::Frame::new(buffer)])),
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()
}
struct Request {
    page: usize,
    width: f64,
    reply: oneshot::Sender<Result<PageRaster, String>>,
}
pub struct PdfWorker {
    sender: mpsc::SyncSender<Request>,
}
impl PdfWorker {
    pub fn new(
        path: PathBuf,
    ) -> std::io::Result<(Self, oneshot::Receiver<Result<LoadedPdf, String>>)> {
        let (sender, receiver) = mpsc::sync_channel::<Request>(1);
        let (loaded, ready) = oneshot::channel();
        std::thread::Builder::new()
            .name("ngertiin-pdf".into())
            .stack_size(8 * 1024 * 1024)
            .spawn(move || {
                let result = (|| -> anyhow::Result<_> {
                    let mut bytes = vec![];
                    std::fs::File::open(path)?
                        .take(PDF_BYTES + 1)
                        .read_to_end(&mut bytes)?;
                    anyhow::ensure!(
                        bytes.len() as u64 <= PDF_BYTES,
                        "PDF preview exceeds 16 MiB. Download the original file."
                    );
                    let bytes = Arc::new(bytes);
                    let data = CFData::from_bytes(&bytes);
                    let provider = CGDataProvider::with_cf_data(Some(&data))
                        .ok_or_else(|| anyhow::anyhow!("PDF data is unavailable."))?;
                    let document =
                        CGPDFDocument::with_provider(Some(&provider)).ok_or_else(|| {
                            anyhow::anyhow!(
                                "Could not read this PDF. Retry or download the original file."
                            )
                        })?;
                    anyhow::ensure!(
                        CGPDFDocument::is_unlocked(Some(&document)),
                        "This PDF is protected. Download the original file to open it."
                    );
                    let count = CGPDFDocument::number_of_pages(Some(&document));
                    anyhow::ensure!(
                        count > 0 && count <= PDF_PAGES,
                        "PDF preview supports 1–500 pages. Download the original file."
                    );
                    let pages = (1..=count)
                        .map(|i| {
                            let page = CGPDFDocument::page(Some(&document), i)
                                .ok_or_else(|| anyhow::anyhow!("A PDF page could not be read."))?;
                            let media = CGPDFPage::box_rect(Some(&page), CGPDFBox::CropBox);
                            let rotation = CGPDFPage::rotation_angle(Some(&page)).rem_euclid(360);
                            anyhow::ensure!(
                                media.size.width.is_finite()
                                    && media.size.height.is_finite()
                                    && media.size.width > 0.
                                    && media.size.height > 0.,
                                "This PDF has an invalid page size. Download the original file."
                            );
                            let (width, height) = if rotation == 90 || rotation == 270 {
                                (media.size.height, media.size.width)
                            } else {
                                (media.size.width, media.size.height)
                            };
                            Ok(PageSize {
                                width,
                                height,
                                media,
                                rotation,
                            })
                        })
                        .collect::<anyhow::Result<Vec<_>>>()?;
                    Ok((document, bytes, pages))
                })();
                let (document, bytes, pages) = match result {
                    Ok(v) => v,
                    Err(e) => {
                        let _ = loaded.send(Err(e.to_string()));
                        return;
                    }
                };
                if loaded
                    .send(Ok(LoadedPdf {
                        bytes,
                        pages: pages.clone(),
                    }))
                    .is_err()
                {
                    return;
                }
                while let Ok(request) = receiver.recv() {
                    if request.reply.is_canceled() {
                        continue;
                    }
                    let result = (|| -> anyhow::Result<PageRaster> {
                        let geometry = pages
                            .get(request.page)
                            .ok_or_else(|| anyhow::anyhow!("PDF page is unavailable."))?;
                        let page = CGPDFDocument::page(Some(&document), request.page + 1)
                            .ok_or_else(|| anyhow::anyhow!("PDF page could not be read."))?;
                        let (width, height) = geometry.raster_size(request.width.clamp(1., 8192.));
                        let mut pixels = vec![255u8; width as usize * height as usize * 4];
                        let space = CGColorSpace::new_device_rgb()
                            .ok_or_else(|| anyhow::anyhow!("PDF color space is unavailable."))?;
                        // SAFETY: the BGRA buffer is width*height*4 bytes with a width*4 stride.
                        // It stays allocated and exclusively borrowed until the context is dropped.
                        let context = unsafe {
                            CGBitmapContextCreate(
                                pixels.as_mut_ptr().cast(),
                                width as usize,
                                height as usize,
                                8,
                                width as usize * 4,
                                Some(&space),
                                2 | (2 << 12),
                            )
                        }
                        .ok_or_else(|| anyhow::anyhow!("PDF canvas is unavailable."))?;
                        let rect = CGRect::new(
                            CGPoint::new(0., 0.),
                            CGSize::new(f64::from(width), f64::from(height)),
                        );
                        CGContext::set_rgb_fill_color(Some(&context), 1., 1., 1., 1.);
                        CGContext::fill_rect(Some(&context), rect);
                        CGContext::scale_ctm(
                            Some(&context),
                            f64::from(width) / geometry.width,
                            f64::from(height) / geometry.height,
                        );
                        let natural = CGRect::new(
                            CGPoint::new(0., 0.),
                            CGSize::new(geometry.width, geometry.height),
                        );
                        let transform = CGPDFPage::drawing_transform(
                            Some(&page),
                            CGPDFBox::CropBox,
                            natural,
                            0,
                            true,
                        );
                        CGContext::concat_ctm(Some(&context), transform);
                        CGContext::draw_pdf_page(Some(&context), Some(&page));
                        drop(context);
                        let tiles = tile_page(width, height, &pixels)?;
                        Ok(PageRaster {
                            page: request.page,
                            tiles,
                            width,
                            height,
                        })
                    })()
                    .map_err(|e| e.to_string());
                    let _ = request.reply.send(result);
                }
            })?;
        Ok((Self { sender }, ready))
    }
    pub fn page(
        &self,
        page: usize,
        width: f64,
    ) -> Result<oneshot::Receiver<Result<PageRaster, String>>, &'static str> {
        let (reply, receiver) = oneshot::channel();
        self.sender
            .try_send(Request { page, width, reply })
            .map_err(|_| "PDF renderer is busy. Retry the page.")?;
        Ok(receiver)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn texture_bands_preserve_all_pixels_and_neighbor_samples() {
        let (width, height) = (1000, 1700);
        let original: Vec<u8> = (0..width as usize * height as usize * 4)
            .map(|i| ((i * 37) ^ (i >> 7)) as u8)
            .collect();
        let tiles = tile_page(width, height, &original).unwrap();
        assert!(tiles.len() > 1);
        let mut reconstructed = vec![];
        let mut top = 0;
        for tile in &tiles {
            assert_eq!(tile.top, top);
            assert!(u64::from(width) * u64::from(tile.source_height) <= TILE_PIXELS);
            assert_eq!(tile.source_top, tile.top.saturating_sub(1));
            let bytes = tile.image.as_bytes(0).unwrap();
            let start = (tile.top - tile.source_top) as usize * width as usize * 4;
            let end = start + tile.height as usize * width as usize * 4;
            reconstructed.extend_from_slice(&bytes[start..end]);
            top += tile.height;
        }
        assert_eq!(top, height);
        assert_eq!(reconstructed, original);
    }
    #[test]
    fn page_rasters_stay_bounded_and_rotated_coordinates_round_trip() {
        for rotation in [0, 90, 180, 270] {
            let media = CGRect::new(CGPoint::new(10., 20.), CGSize::new(612., 792.));
            let (width, height) = if rotation % 180 == 0 {
                (612., 792.)
            } else {
                (792., 612.)
            };
            let page = PageSize {
                width,
                height,
                media,
                rotation,
            };
            for desired in [306., 612., 2448., 8192.] {
                let (w, h) = page.raster_size(desired);
                assert!(u64::from(w) * u64::from(h) <= PAGE_PIXELS);
                let (x, y) = page.display_point(123., 456., desired);
                let (px, py) = page.to_pdf(x, y, desired);
                assert!((px - 123.).abs() < 1e-8 && (py - 456.).abs() < 1e-8);
            }
        }
    }
    #[test]
    fn rejected_pdf_inputs_stay_actionable_and_large_documents_are_bounded() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../verification/nma-067/pdf");
        for (file, expected) in [("protected.pdf", "protected"), ("page-limit.pdf", "1–500")] {
            let (_, ready) = PdfWorker::new(root.join(file)).unwrap();
            let error = futures_executor::block_on(ready)
                .unwrap()
                .err()
                .expect("Rejected document");
            assert!(error.contains(expected), "{error}");
        }
        let (worker, ready) = PdfWorker::new(root.join("long.pdf")).unwrap();
        let loaded = futures_executor::block_on(ready).unwrap().unwrap();
        assert_eq!(loaded.pages.len(), 200);
        for index in [0, 99, 199] {
            let page = futures_executor::block_on(worker.page(index, 8192.).unwrap())
                .unwrap()
                .unwrap();
            assert!(u64::from(page.width) * u64::from(page.height) <= PAGE_PIXELS);
            let mut top = 0;
            for tile in &page.tiles {
                assert_eq!(tile.top, top);
                assert!(u64::from(page.width) * u64::from(tile.source_height) <= TILE_PIXELS);
                assert!(tile.source_top <= tile.top);
                assert!(tile.source_top + tile.source_height >= tile.top + tile.height);
                assert_eq!(
                    tile.image.as_bytes(0).unwrap().len(),
                    page.width as usize * tile.source_height as usize * 4
                );
                top += tile.height;
            }
            assert_eq!(top, page.height);
        }
        let path = std::env::temp_dir().join(format!("ngertiin-pdf-{}.pdf", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"not a PDF").unwrap();
        let (_, ready) = PdfWorker::new(path.clone()).unwrap();
        assert!(futures_executor::block_on(ready).unwrap().is_err());
        std::fs::File::create(&path)
            .unwrap()
            .set_len(PDF_BYTES + 1)
            .unwrap();
        let (_, ready) = PdfWorker::new(path.clone()).unwrap();
        assert!(
            futures_executor::block_on(ready)
                .unwrap()
                .err()
                .unwrap()
                .contains("16 MiB")
        );
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn native_pdf_worker_reads_fixture_and_bounds_page_memory() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/probe.pdf");
        let (worker, ready) = PdfWorker::new(path).unwrap();
        let loaded = futures_executor::block_on(ready).unwrap().unwrap();
        assert_eq!(loaded.pages.len(), 2);
        let page = futures_executor::block_on(worker.page(0, 2448.).unwrap())
            .unwrap()
            .unwrap();
        assert!(u64::from(page.width) * u64::from(page.height) <= PAGE_PIXELS);
        let bytes: Vec<u8> = page
            .tiles
            .iter()
            .flat_map(|tile| {
                let start = (tile.top - tile.source_top) as usize * page.width as usize * 4;
                let end = start + tile.height as usize * page.width as usize * 4;
                tile.image.as_bytes(0).unwrap()[start..end].iter().copied()
            })
            .collect();
        let mut bbox = (page.width, page.height, 0, 0);
        for (i, pixel) in bytes.as_chunks::<4>().0.iter().enumerate() {
            if pixel[..3].iter().any(|c| *c < 250) {
                let (x, y) = (i as u32 % page.width, i as u32 / page.width);
                bbox = (bbox.0.min(x), bbox.1.min(y), bbox.2.max(x), bbox.3.max(y));
            }
        }
        assert!(
            bbox.0 < 2 && bbox.1 < 2,
            "The PDF must fill its raster: {bbox:?}"
        );
        assert!(bbox.2 >= page.width - 2 && bbox.3 >= page.height - 2);
        assert!(!bytes.is_empty());
    }
}

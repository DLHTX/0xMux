use crate::types::{AnnotatedScreenshot, ImageFormat};
use base64::Engine;
use image::ImageEncoder;
use std::io::Cursor;

/// Capture a screenshot of the specified monitor with full HiDPI metadata
pub fn capture_monitor(monitor_id: Option<u32>, format: ImageFormat, quality: u8, scale: f32) -> Result<AnnotatedScreenshot, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {e}"))?;

    let monitor = if let Some(id) = monitor_id {
        monitors
            .iter()
            .find(|m| m.id().is_ok_and(|mid| mid == id))
            .ok_or_else(|| format!("Monitor {id} not found"))?
    } else {
        monitors.first().ok_or("No monitors found")?
    };

    let logical_w = monitor.width().map_err(|e| format!("Failed to get width: {e}"))?;
    let logical_h = monitor.height().map_err(|e| format!("Failed to get height: {e}"))?;
    let scale_factor = monitor.scale_factor().map_err(|e| format!("Failed to get scale factor: {e}"))?;
    let mid = monitor.id().map_err(|e| format!("Failed to get monitor id: {e}"))?;

    let img = monitor
        .capture_image()
        .map_err(|e| format!("Screenshot failed: {e}"))?;

    let physical_w = img.width();
    let physical_h = img.height();

    // Resize if scale parameter < 1.0
    let img = if scale < 1.0 {
        let new_w = (physical_w as f32 * scale) as u32;
        let new_h = (physical_h as f32 * scale) as u32;
        image::imageops::resize(
            &img,
            new_w,
            new_h,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    let encoded = encode_image(&img, format, quality)?;
    let image_b64 = base64::engine::general_purpose::STANDARD.encode(&encoded);

    Ok(AnnotatedScreenshot {
        image: image_b64,
        format,
        physical_width: physical_w,
        physical_height: physical_h,
        logical_width: logical_w,
        logical_height: logical_h,
        scale_factor,
        monitor_id: mid,
    })
}

/// Capture a specific window by title substring
pub fn capture_window(title: &str, format: ImageFormat, quality: u8) -> Result<AnnotatedScreenshot, String> {
    let windows = xcap::Window::all().map_err(|e| format!("Failed to enumerate windows: {e}"))?;

    let window = windows
        .iter()
        .find(|w| w.title().is_ok_and(|t| t.contains(title)))
        .ok_or_else(|| format!("No window matching '{title}'"))?;

    let img = window
        .capture_image()
        .map_err(|e| format!("Window screenshot failed: {e}"))?;

    let physical_w = img.width();
    let physical_h = img.height();

    // For window captures, infer scale factor from primary monitor
    let scale_factor = super::display::get_scale_factor(None).unwrap_or(1.0);
    let logical_w = (physical_w as f32 / scale_factor) as u32;
    let logical_h = (physical_h as f32 / scale_factor) as u32;

    let encoded = encode_image(&img, format, quality)?;
    let image_b64 = base64::engine::general_purpose::STANDARD.encode(&encoded);

    Ok(AnnotatedScreenshot {
        image: image_b64,
        format,
        physical_width: physical_w,
        physical_height: physical_h,
        logical_width: logical_w,
        logical_height: logical_h,
        scale_factor,
        monitor_id: 0,
    })
}

fn encode_image(img: &image::RgbaImage, format: ImageFormat, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    match format {
        ImageFormat::Png => {
            let encoder = image::codecs::png::PngEncoder::new(Cursor::new(&mut buf));
            encoder
                .write_image(img.as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgba8)
                .map_err(|e| format!("PNG encode failed: {e}"))?;
        }
        ImageFormat::Jpeg => {
            // Convert RGBA to RGB for JPEG
            let rgb: image::RgbImage = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut buf), quality);
            encoder
                .write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG encode failed: {e}"))?;
        }
    }
    Ok(buf)
}

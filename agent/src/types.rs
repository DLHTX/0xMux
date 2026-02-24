use serde::{Deserialize, Serialize};

/// Logical coordinate point (used by mouse APIs and UI tree bounds)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

/// Physical pixel coordinate point (used in raw screenshots)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PhysicalPoint {
    pub x: u32,
    pub y: u32,
}

/// Logical rectangle (position + size in logical coordinates)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Dimensions (width x height)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Dimensions {
    pub width: u32,
    pub height: u32,
}

/// Mouse button type
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

/// Keyboard modifier keys
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Modifier {
    Ctrl,
    Shift,
    Alt,
    Meta,
}

/// Monitor/display information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub logical_width: u32,
    pub logical_height: u32,
    pub physical_width: u32,
    pub physical_height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

/// Window information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: u64,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub monitor_id: u32,
    pub is_focused: bool,
}

/// Screenshot with HiDPI metadata — the core type that solves coordinate mismatch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotatedScreenshot {
    /// Base64-encoded image data
    pub image: String,
    /// Image format
    pub format: ImageFormat,
    /// Physical pixel dimensions of the captured image
    pub physical_width: u32,
    pub physical_height: u32,
    /// Logical dimensions (what the OS reports)
    pub logical_width: u32,
    pub logical_height: u32,
    /// Scale factor (e.g., 2.0 for Retina)
    pub scale_factor: f32,
    /// Which monitor was captured
    pub monitor_id: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
}

/// UI element from accessibility tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIElement {
    pub ref_id: String,
    pub role: String,
    pub name: String,
    pub value: Option<String>,
    pub bounds: Rect,
    pub children_count: u32,
}

/// Accessibility tree for a window
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UITree {
    pub app_name: String,
    pub window_title: String,
    pub elements: Vec<UIElement>,
    pub total_elements: u32,
    pub truncated: bool,
}

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub truncated: bool,
}

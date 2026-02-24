use crate::types::MonitorInfo;

/// Enumerate all connected displays with their metadata
pub fn list_displays() -> Result<Vec<MonitorInfo>, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {e}"))?;

    let mut result = Vec::new();
    for (i, m) in monitors.iter().enumerate() {
        let logical_w = m.width().map_err(|e| format!("Failed to get width: {e}"))?;
        let logical_h = m.height().map_err(|e| format!("Failed to get height: {e}"))?;
        let scale = m.scale_factor().map_err(|e| format!("Failed to get scale factor: {e}"))?;
        let mid = m.id().map_err(|e| format!("Failed to get monitor id: {e}"))?;
        let name = m.name().map_err(|e| format!("Failed to get monitor name: {e}"))?;

        let physical_w = (logical_w as f32 * scale) as u32;
        let physical_h = (logical_h as f32 * scale) as u32;

        result.push(MonitorInfo {
            id: mid,
            name,
            logical_width: logical_w,
            logical_height: logical_h,
            physical_width: physical_w,
            physical_height: physical_h,
            scale_factor: scale,
            is_primary: i == 0, // xcap returns primary first
        });
    }

    Ok(result)
}

/// Get scale factor for a specific monitor (or primary if not found)
pub fn get_scale_factor(monitor_id: Option<u32>) -> Result<f32, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {e}"))?;

    if let Some(id) = monitor_id {
        for m in &monitors {
            let mid = m.id().map_err(|e| format!("Failed to get monitor id: {e}"))?;
            if mid == id {
                return m.scale_factor().map_err(|e| format!("Failed to get scale factor: {e}"));
            }
        }
    }

    // Default to primary monitor
    monitors
        .first()
        .ok_or_else(|| "No monitors found".to_string())
        .and_then(|m| m.scale_factor().map_err(|e| format!("Failed to get scale factor: {e}")))
}

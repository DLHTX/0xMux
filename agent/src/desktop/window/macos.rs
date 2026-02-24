use crate::types::WindowInfo;
use std::process::Command;

/// List all visible windows using xcap
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let windows = xcap::Window::all().map_err(|e| format!("Failed to enumerate windows: {e}"))?;

    let mut result = Vec::new();
    for w in &windows {
        let title = w.title().unwrap_or_default();
        let app_name = w.app_name().unwrap_or_default();

        // Skip windows with empty titles (menu bar items, etc.)
        if title.is_empty() && app_name.is_empty() {
            continue;
        }

        let id = w.id().unwrap_or(0) as u64;
        let x = w.x().unwrap_or(0);
        let y = w.y().unwrap_or(0);
        let width = w.width().unwrap_or(0);
        let height = w.height().unwrap_or(0);
        let is_minimized = w.is_minimized().unwrap_or(false);

        if is_minimized {
            continue;
        }

        result.push(WindowInfo {
            id,
            title,
            app_name,
            x,
            y,
            width,
            height,
            monitor_id: 0,
            is_focused: false,
        });
    }

    // Try to detect focused app via AppleScript
    if let Ok(focused_app) = get_focused_app() {
        for w in &mut result {
            if w.app_name == focused_app {
                w.is_focused = true;
                break;
            }
        }
    }

    Ok(result)
}

/// Focus a window by title substring
pub fn focus_window(title: &str) -> Result<(), String> {
    // First try to find the app that owns the window
    let windows = xcap::Window::all().map_err(|e| format!("Failed to enumerate windows: {e}"))?;

    let app_name = windows
        .iter()
        .find(|w| w.title().is_ok_and(|t| t.contains(title)))
        .and_then(|w| w.app_name().ok())
        .ok_or_else(|| format!("No window matching '{title}'"))?;

    // Use osascript to activate the app
    let script = format!(
        "tell application \"{}\" to activate",
        app_name.replace('"', "\\\"")
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to focus '{app_name}': {stderr}"));
    }

    Ok(())
}

/// Launch an application by name
pub fn launch_app(name: &str) -> Result<u32, String> {
    let output = Command::new("open")
        .args(["-a", name])
        .output()
        .map_err(|e| format!("Failed to launch '{name}': {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to launch '{name}': {stderr}"));
    }

    // Try to get PID via pgrep
    let pid_output = Command::new("pgrep")
        .args(["-x", name])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout)
                    .ok()?
                    .lines()
                    .next()?
                    .trim()
                    .parse::<u32>()
                    .ok()
            } else {
                None
            }
        });

    Ok(pid_output.unwrap_or(0))
}

/// Quit an application by name
pub fn quit_app(name: &str) -> Result<(), String> {
    let script = format!(
        "tell application \"{}\" to quit",
        name.replace('"', "\\\"")
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to quit '{name}': {stderr}"));
    }

    Ok(())
}

/// Check if an application is running
pub fn is_running(name: &str) -> Result<bool, String> {
    let script = format!(
        "tell application \"System Events\" to (name of processes) contains \"{}\"",
        name.replace('"', "\\\"")
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to check '{name}': {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim() == "true")
}

fn get_focused_app() -> Result<String, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Could not determine focused app".to_string())
    }
}

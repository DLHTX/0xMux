#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use crate::types::WindowInfo;

/// List all visible windows
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    platform_list_windows()
}

/// Focus a window by title substring match
pub fn focus_window(title: &str) -> Result<(), String> {
    platform_focus_window(title)
}

/// Launch an application by name, returns process ID if available
pub fn launch_app(name: &str) -> Result<u32, String> {
    platform_launch_app(name)
}

/// Quit an application by name
pub fn quit_app(name: &str) -> Result<(), String> {
    platform_quit_app(name)
}

/// Check if an application is running
pub fn is_running(name: &str) -> Result<bool, String> {
    platform_is_running(name)
}

// --- Platform dispatch ---

#[cfg(target_os = "macos")]
fn platform_list_windows() -> Result<Vec<WindowInfo>, String> {
    macos::list_windows()
}

#[cfg(target_os = "macos")]
fn platform_focus_window(title: &str) -> Result<(), String> {
    macos::focus_window(title)
}

#[cfg(target_os = "macos")]
fn platform_launch_app(name: &str) -> Result<u32, String> {
    macos::launch_app(name)
}

#[cfg(target_os = "macos")]
fn platform_quit_app(name: &str) -> Result<(), String> {
    macos::quit_app(name)
}

#[cfg(target_os = "macos")]
fn platform_is_running(name: &str) -> Result<bool, String> {
    macos::is_running(name)
}

#[cfg(target_os = "windows")]
fn platform_list_windows() -> Result<Vec<WindowInfo>, String> {
    windows::list_windows()
}

#[cfg(target_os = "windows")]
fn platform_focus_window(title: &str) -> Result<(), String> {
    windows::focus_window(title)
}

#[cfg(target_os = "windows")]
fn platform_launch_app(name: &str) -> Result<u32, String> {
    windows::launch_app(name)
}

#[cfg(target_os = "windows")]
fn platform_quit_app(name: &str) -> Result<(), String> {
    windows::quit_app(name)
}

#[cfg(target_os = "windows")]
fn platform_is_running(name: &str) -> Result<bool, String> {
    windows::is_running(name)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_list_windows() -> Result<Vec<WindowInfo>, String> {
    Err("Window management not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_focus_window(_title: &str) -> Result<(), String> {
    Err("Window management not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_launch_app(_name: &str) -> Result<u32, String> {
    Err("Window management not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_quit_app(_name: &str) -> Result<(), String> {
    Err("Window management not supported on this platform".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_is_running(_name: &str) -> Result<bool, String> {
    Err("Window management not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows_impl;
pub mod ref_manager;

use crate::types::{UIElement, UITree};

/// Options for reading the UI tree
pub struct UITreeOptions {
    /// Target window title (substring match). None = frontmost window
    pub window_title: Option<String>,
    /// Filter: "interactive" for buttons/inputs only, "all" for everything
    pub filter: UITreeFilter,
    /// Maximum tree depth to traverse
    pub depth: u32,
    /// Maximum elements to return
    pub max_elements: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UITreeFilter {
    All,
    Interactive,
}

impl Default for UITreeOptions {
    fn default() -> Self {
        Self {
            window_title: None,
            filter: UITreeFilter::All,
            depth: 10,
            max_elements: 500,
        }
    }
}

/// Read the accessibility tree of the frontmost or specified window
pub fn read_tree(options: &UITreeOptions) -> Result<UITree, String> {
    let mut tree = platform_read_tree(options)?;

    // Assign ref IDs
    for (i, elem) in tree.elements.iter_mut().enumerate() {
        elem.ref_id = format!("e{}", i + 1);
    }

    tree.total_elements = tree.elements.len() as u32;
    Ok(tree)
}

/// Find elements matching a query string in the UI tree
pub fn find_elements(query: &str, options: &UITreeOptions) -> Result<Vec<UIElement>, String> {
    let tree = read_tree(options)?;
    let query_lower = query.to_lowercase();

    let matched: Vec<UIElement> = tree
        .elements
        .into_iter()
        .filter(|e| {
            e.name.to_lowercase().contains(&query_lower)
                || e.role.to_lowercase().contains(&query_lower)
                || e.value
                    .as_deref()
                    .is_some_and(|v| v.to_lowercase().contains(&query_lower))
        })
        .collect();

    Ok(matched)
}

// --- Platform dispatch ---

#[cfg(target_os = "macos")]
fn platform_read_tree(options: &UITreeOptions) -> Result<UITree, String> {
    macos::read_tree(options)
}

#[cfg(target_os = "windows")]
fn platform_read_tree(options: &UITreeOptions) -> Result<UITree, String> {
    windows_impl::read_tree(options)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_read_tree(_options: &UITreeOptions) -> Result<UITree, String> {
    Err("UI tree reading not supported on this platform".to_string())
}

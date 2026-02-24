use crate::types::UITree;
use super::UITreeOptions;

/// Read the UI tree on Windows using UIAutomation
pub fn read_tree(_options: &UITreeOptions) -> Result<UITree, String> {
    // TODO: Implement with windows::Win32::UI::Accessibility or uiautomation crate
    Err("Windows UI tree reading not yet implemented".to_string())
}

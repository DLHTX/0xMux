use super::{UITreeFilter, UITreeOptions};
use crate::types::{Rect, UIElement, UITree};
use std::process::Command;

/// Read the UI tree on macOS using System Events accessibility API via osascript
pub fn read_tree(options: &UITreeOptions) -> Result<UITree, String> {
    let depth = options.depth.min(10);
    let max_elements = options.max_elements;
    let filter = options.filter;

    // Get the target app name
    let app_name = if let Some(ref title) = options.window_title {
        find_app_by_window_title(title)?
    } else {
        get_frontmost_app()?
    };

    // Use AppleScript to read the accessibility tree
    let script = build_tree_script(&app_name, depth, max_elements, filter);

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to read UI tree for '{app_name}': {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let elements = parse_elements(&stdout, filter);
    let truncated = elements.len() as u32 >= max_elements;

    // Try to get window title
    let window_title = get_window_title(&app_name).unwrap_or_default();

    Ok(UITree {
        app_name,
        window_title,
        elements,
        total_elements: 0, // Will be set by caller
        truncated,
    })
}

fn get_frontmost_app() -> Result<String, String> {
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
        Err("Could not determine frontmost app".to_string())
    }
}

fn find_app_by_window_title(title: &str) -> Result<String, String> {
    let windows = xcap::Window::all().map_err(|e| format!("Failed to list windows: {e}"))?;
    windows
        .iter()
        .find(|w| w.title().is_ok_and(|t| t.contains(title)))
        .and_then(|w| w.app_name().ok())
        .ok_or_else(|| format!("No app found with window title matching '{title}'"))
}

fn get_window_title(app_name: &str) -> Result<String, String> {
    let script = format!(
        "tell application \"System Events\" to tell process \"{}\" to get name of front window",
        app_name.replace('"', "\\\"")
    );
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("osascript failed: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Ok(String::new())
    }
}

fn build_tree_script(
    app_name: &str,
    depth: u32,
    max_elements: u32,
    filter: UITreeFilter,
) -> String {
    let filter_clause = match filter {
        UITreeFilter::Interactive => {
            r#"set validRoles to {"AXButton", "AXTextField", "AXTextArea", "AXCheckBox", "AXRadioButton", "AXPopUpButton", "AXComboBox", "AXSlider", "AXLink", "AXMenuItem", "AXMenuButton", "AXTab"}
                if validRoles does not contain roleStr then
                    set skipElement to true
                end if"#
        }
        UITreeFilter::All => "set skipElement to false",
    };

    format!(
        r#"
tell application "System Events"
    tell process "{app_name}"
        set uiElements to {{}}
        set elementCount to 0
        set maxElements to {max_elements}
        set maxDepth to {depth}

        on getElements(parentElement, currentDepth, maxDepth, maxElements)
            global uiElements, elementCount
            if currentDepth > maxDepth then return
            if elementCount >= maxElements then return

            try
                set children to UI elements of parentElement
            on error
                return
            end try

            repeat with child in children
                if elementCount >= maxElements then exit repeat
                try
                    set roleStr to role of child
                    set nameStr to ""
                    try
                        set nameStr to name of child
                    end try
                    set valStr to ""
                    try
                        set valStr to value of child as text
                    end try
                    set posVal to {{0, 0}}
                    try
                        set posVal to position of child
                    end try
                    set sizeVal to {{0, 0}}
                    try
                        set sizeVal to size of child
                    end try

                    set skipElement to false
                    {filter_clause}

                    if not skipElement then
                        set elementCount to elementCount + 1
                        set end of uiElements to roleStr & "|||" & nameStr & "|||" & valStr & "|||" & (item 1 of posVal) & "," & (item 2 of posVal) & "," & (item 1 of sizeVal) & "," & (item 2 of sizeVal)
                    end if

                    my getElements(child, currentDepth + 1, maxDepth, maxElements)
                end try
            end repeat
        end getElements

        try
            set frontWindow to front window
            my getElements(frontWindow, 1, maxDepth, maxElements)
        on error
            my getElements(process "{app_name}", 1, maxDepth, maxElements)
        end try

        set AppleScript's text item delimiters to linefeed
        return uiElements as text
    end tell
end tell
"#,
        app_name = app_name.replace('"', "\\\""),
        max_elements = max_elements,
        depth = depth,
        filter_clause = filter_clause,
    )
}

fn parse_elements(output: &str, _filter: UITreeFilter) -> Vec<UIElement> {
    let mut elements = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.splitn(4, "|||").collect();
        if parts.len() < 4 {
            continue;
        }

        let role = parts[0].to_string();
        let name = parts[1].to_string();
        let value = if parts[2].is_empty() {
            None
        } else {
            Some(parts[2].to_string())
        };

        let bounds = parse_bounds(parts[3]);

        elements.push(UIElement {
            ref_id: String::new(), // Will be assigned by mod.rs
            role,
            name,
            value,
            bounds,
            children_count: 0,
        });
    }

    elements
}

fn parse_bounds(s: &str) -> Rect {
    let nums: Vec<f64> = s
        .split(',')
        .filter_map(|n| n.trim().parse::<f64>().ok())
        .collect();

    if nums.len() >= 4 {
        Rect {
            x: nums[0],
            y: nums[1],
            width: nums[2],
            height: nums[3],
        }
    } else {
        Rect {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }
}

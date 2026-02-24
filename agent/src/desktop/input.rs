use crate::types::MouseButton;
use enigo::{Enigo, Keyboard, Mouse, Settings, Coordinate, Button, Direction};

/// Create a new Enigo instance
fn create_enigo() -> Result<Enigo, String> {
    Enigo::new(&Settings::default()).map_err(|e| format!("Failed to create input controller: {e}"))
}

/// Move mouse to logical coordinates and click
pub fn click(x: i32, y: i32, button: MouseButton) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Move mouse failed: {e}"))?;
    let btn = to_enigo_button(button);
    enigo
        .button(btn, Direction::Click)
        .map_err(|e| format!("Click failed: {e}"))?;
    Ok(())
}

/// Double-click at logical coordinates
pub fn double_click(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Move mouse failed: {e}"))?;
    enigo
        .button(Button::Left, Direction::Click)
        .map_err(|e| format!("Click failed: {e}"))?;
    enigo
        .button(Button::Left, Direction::Click)
        .map_err(|e| format!("Double click failed: {e}"))?;
    Ok(())
}

/// Type text string (supports Unicode)
pub fn type_text(text: &str) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    enigo
        .text(text)
        .map_err(|e| format!("Type text failed: {e}"))?;
    Ok(())
}

/// Press a key combination (e.g., "ctrl+c")
pub fn press_key(combo: &str) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    let (modifiers, main_key) = super::keys::parse_key_combo(combo)?;

    // Press modifiers down
    for m in &modifiers {
        enigo
            .key(*m, Direction::Press)
            .map_err(|e| format!("Key press failed: {e}"))?;
    }

    // Press and release main key
    enigo
        .key(main_key, Direction::Click)
        .map_err(|e| format!("Key click failed: {e}"))?;

    // Release modifiers in reverse order
    for m in modifiers.iter().rev() {
        enigo
            .key(*m, Direction::Release)
            .map_err(|e| format!("Key release failed: {e}"))?;
    }

    Ok(())
}

/// Drag from one logical coordinate to another
pub fn drag(from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    enigo
        .move_mouse(from_x, from_y, Coordinate::Abs)
        .map_err(|e| format!("Move to start failed: {e}"))?;
    enigo
        .button(Button::Left, Direction::Press)
        .map_err(|e| format!("Mouse down failed: {e}"))?;
    enigo
        .move_mouse(to_x, to_y, Coordinate::Abs)
        .map_err(|e| format!("Move to end failed: {e}"))?;
    enigo
        .button(Button::Left, Direction::Release)
        .map_err(|e| format!("Mouse up failed: {e}"))?;
    Ok(())
}

/// Move mouse to logical coordinates without clicking
pub fn move_to(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = create_enigo()?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Move mouse failed: {e}"))?;
    Ok(())
}

fn to_enigo_button(button: MouseButton) -> Button {
    match button {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

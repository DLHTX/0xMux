use enigo::Key;

/// Parse a key combination string like "ctrl+shift+s" into modifier keys and a main key.
/// Returns (modifiers, main_key).
pub fn parse_key_combo(combo: &str) -> Result<(Vec<Key>, Key), String> {
    let parts: Vec<String> = combo.split('+').map(|s| s.trim().to_lowercase()).collect();

    if parts.is_empty() {
        return Err("Empty key combination".to_string());
    }

    let mut modifiers = Vec::new();
    let main_key;

    if parts.len() == 1 {
        main_key = str_to_key(&parts[0])?;
    } else {
        for part in &parts[..parts.len() - 1] {
            modifiers.push(str_to_modifier(part)?);
        }
        main_key = str_to_key(parts.last().unwrap())?;
    }

    Ok((modifiers, main_key))
}

fn str_to_modifier(s: &str) -> Result<Key, String> {
    match s {
        "ctrl" | "control" => Ok(Key::Control),
        "shift" => Ok(Key::Shift),
        "alt" | "option" => Ok(Key::Alt),
        "meta" | "cmd" | "command" | "win" | "super" => Ok(Key::Meta),
        other => Err(format!("Unknown modifier: {other}")),
    }
}

fn str_to_key(s: &str) -> Result<Key, String> {
    match s {
        // Letters
        s if s.len() == 1 && s.chars().next().unwrap().is_ascii_alphanumeric() => {
            Ok(Key::Unicode(s.chars().next().unwrap()))
        }

        // Function keys
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),

        // Special keys
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "space" => Ok(Key::Space),
        "backspace" | "back" => Ok(Key::Backspace),
        "delete" | "del" => Ok(Key::Delete),
        "escape" | "esc" => Ok(Key::Escape),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),

        // Arrow keys
        "up" | "arrowup" => Ok(Key::UpArrow),
        "down" | "arrowdown" => Ok(Key::DownArrow),
        "left" | "arrowleft" => Ok(Key::LeftArrow),
        "right" | "arrowright" => Ok(Key::RightArrow),

        // Modifiers as main key
        "ctrl" | "control" => Ok(Key::Control),
        "shift" => Ok(Key::Shift),
        "alt" | "option" => Ok(Key::Alt),
        "meta" | "cmd" | "command" | "win" | "super" => Ok(Key::Meta),

        other => Err(format!("Unknown key: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_key() {
        let (mods, key) = parse_key_combo("enter").unwrap();
        assert!(mods.is_empty());
        assert!(matches!(key, Key::Return));
    }

    #[test]
    fn test_ctrl_c() {
        let (mods, key) = parse_key_combo("ctrl+c").unwrap();
        assert_eq!(mods.len(), 1);
        assert!(matches!(mods[0], Key::Control));
        assert!(matches!(key, Key::Unicode('c')));
    }

    #[test]
    fn test_ctrl_shift_s() {
        let (mods, key) = parse_key_combo("ctrl+shift+s").unwrap();
        assert_eq!(mods.len(), 2);
        assert!(matches!(key, Key::Unicode('s')));
    }
}

import { runAppleScript } from "../utils/jxa.js";

/** Type text using AppleScript keystroke */
export async function keyboardType(text: string): Promise<string> {
  // Escape for AppleScript string
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `tell application "System Events" to keystroke "${escaped}"`;
  await runAppleScript(script);
  return `typed ${text.length} characters`;
}

// Map common modifier names to AppleScript modifiers
const MODIFIER_MAP: Record<string, string> = {
  cmd: "command down",
  command: "command down",
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  option: "option down",
  shift: "shift down",
};

// Map special key names to AppleScript key codes
const KEY_CODE_MAP: Record<string, number> = {
  return: 36,
  enter: 76,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

/** Execute a keyboard shortcut like "cmd+c", "cmd+shift+s", "ctrl+alt+delete" */
export async function keyboardShortcut(shortcut: string): Promise<string> {
  const parts = shortcut.toLowerCase().split("+").map((s) => s.trim());
  const key = parts.pop()!;
  const modifiers = parts
    .map((m) => MODIFIER_MAP[m])
    .filter(Boolean);

  const modStr = modifiers.length > 0 ? ` using {${modifiers.join(", ")}}` : "";

  let script: string;
  const keyCode = KEY_CODE_MAP[key];
  if (keyCode !== undefined) {
    script = `tell application "System Events" to key code ${keyCode}${modStr}`;
  } else if (key.length === 1) {
    script = `tell application "System Events" to keystroke "${key}"${modStr}`;
  } else {
    return `Unknown key: ${key}`;
  }

  await runAppleScript(script);
  return `pressed ${shortcut}`;
}

import { platform } from "node:os";

/** Throw if not running on macOS */
export function assertMacOS(): void {
  if (platform() !== "darwin") {
    throw new Error(
      "0xmux-computer only supports macOS. " +
      "It relies on osascript (JXA/AppleScript) and screencapture which are macOS-only."
    );
  }
}

/** Print accessibility permission hint to stderr */
export function printPermissionHint(): void {
  console.error(
    "[0xmux-computer] First-time setup:\n" +
    "  1. System Settings > Privacy & Security > Accessibility — add your terminal app\n" +
    "  2. System Settings > Privacy & Security > Screen Recording — add your terminal app\n" +
    "  These permissions are required for mouse/keyboard control and screenshots."
  );
}

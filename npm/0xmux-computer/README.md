# 0xmux-computer

macOS Computer Use MCP Server — let AI control your desktop.

Zero native dependencies. Uses `osascript` (JXA/AppleScript) + `screencapture` CLI.

## Quick Start

```json
{
  "mcpServers": {
    "computer": {
      "command": "npx",
      "args": ["-y", "0xmux-computer"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `screen_info` | Display resolution, scale factor, visible area |
| `window_list` | All visible windows with app, title, position, size |
| `window_focus` | Focus window by app name or title |
| `mouse_move` | Move cursor to (x, y) |
| `mouse_click` | Click at (x, y), left/right, single/double |
| `keyboard_type` | Type text at cursor |
| `keyboard_shortcut` | Execute shortcut like `cmd+c` |
| `screenshot` | Full screen, region, or window — returns base64 PNG |

## Requirements

- macOS only
- Node.js >= 18
- First run: grant Accessibility + Screen Recording permissions to your terminal

## Permissions

System Settings > Privacy & Security:
1. **Accessibility** — required for mouse/keyboard control
2. **Screen Recording** — required for screenshots

## Version Management

```bash
# Patch release (0.1.0 -> 0.1.1)
npm version patch

# Minor release (0.1.1 -> 0.2.0)
npm version minor

# Major release (0.2.0 -> 1.0.0)
npm version major

# Publish
npm publish
```

## License

MIT

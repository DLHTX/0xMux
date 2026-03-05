# 0xMux

```
  ██████╗ ██╗  ██╗███╗   ███╗██╗   ██╗██╗  ██╗
 ██╔═████╗╚██╗██╔╝████╗ ████║██║   ██║╚██╗██╔╝
 ██║██╔██║ ╚███╔╝ ██╔████╔██║██║   ██║ ╚███╔╝
 ████╔╝██║ ██╔██╗ ██║╚██╔╝██║██║   ██║ ██╔██╗
 ╚██████╔╝██╔╝ ██╗██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
```

<p align="center">
  <a href="https://www.npmjs.com/package/0xmux"><img src="https://img.shields.io/npm/v/0xmux?style=flat-square&color=cb3837&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/0xmux"><img src="https://img.shields.io/npm/dm/0xmux?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
  <a href="https://github.com/DLHTX/0xmux"><img src="https://img.shields.io/github/stars/DLHTX/0xmux?style=flat-square&color=ffdd00&label=stars" alt="GitHub stars" /></a>
  <a href="https://github.com/DLHTX/0xmux/blob/main/LICENSE"><img src="https://img.shields.io/github/license/DLHTX/0xmux?style=flat-square&color=blue" alt="License" /></a>
  <img src="https://img.shields.io/badge/rust-stable-orange?style=flat-square&logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <img width="2184" height="1478" alt="0xMux Screenshot" src="https://github.com/user-attachments/assets/459e34d9-c00e-4b53-8f78-7c57a3b5d29b" style="border-radius:12px;" />
</p>

**Hacker-grade tmux session manager with web UI.**

A self-hosted web app that lets you manage and interact with tmux sessions from your browser. Real-time terminal access via WebSocket, works on desktop and mobile. One binary, zero config.

[中文](./README.zh.md) | English

---

## What is 0xMux?

0xMux turns tmux into a full-featured IDE-like experience in your browser. Instead of SSH-ing into a machine and attaching to tmux manually, you open a URL and get a visual workspace with terminals, file management, Git integration, and more — all powered by your existing tmux sessions.

## Install

```sh
# npx (one-time run)
npx 0xmux

# npm (global install)
npm install -g 0xmux
0xmux

# Homebrew (macOS)
brew install DLHTX/0xmux/0xmux
0xmux
```

Then open `http://localhost:1234` in your browser.

## Features

### Terminal Management
- Create, rename, and delete tmux sessions directly from the browser
- Multi-window support — each session can have multiple windows with tabs
- Split panes — horizontal and vertical splits, just like tmux
- Real-time terminal rendering via xterm.js with WebGL acceleration
- Resizable split workspace with drag-to-resize panels

### File Explorer & Editor
- Browse the filesystem with a tree-view file explorer
- Built-in code editor with syntax highlighting and Markdown preview (Vditor)
- Quick file search (fuzzy finder)
- File upload, rename, delete, and create — all from the browser
- Image preview with built-in viewer

### Git Integration
- View repo status, branches, and commit log
- Stage / unstage files, view diffs
- Commit, push, checkout, and discard changes
- All Git operations available through a visual sidebar panel

### AI Tool Management
- Browse and install AI coding tools (Claude Code, Cursor, etc.)
- Manage MCP server configurations
- Sync global AI config across tools

### Security
- Optional password authentication with Argon2 hashing
- Session-based auth with token middleware
- Setup wizard on first launch — set a password or skip

### Mobile Access
- Full terminal access from your phone or tablet
- Responsive layout — adapts to any screen size
- Virtual keyboard bar with common shortcuts (Tab, Ctrl, Esc, arrows, etc.)
- Swipe navigation between sessions, files, and terminal views
- Compact UI mode for narrow screens

### Desktop & Browser Automation (Agent Module)
- Remote desktop control — screenshot, click, type, drag
- Browser automation — navigate, click elements, manage tabs
- Cron job scheduler for automated tasks
- UI accessibility tree inspection

### Other
- Notification system with in-app alerts
- Layout persistence — your panel arrangement is saved and restored
- Auto-update checker with one-click update
- Dependency detection — guides you through installing tmux if missing
- i18n support (English / Chinese)
- Single binary distribution — frontend is embedded via rust-embed
- Brutalist pixel-art theme with customizable color settings

## Stack

- **Backend:** Rust + Axum + WebSocket + portable-pty
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + xterm.js
- **Build:** Single binary with embedded frontend (rust-embed)
- **Distribution:** npm + Homebrew + GitHub Releases

## License

MIT

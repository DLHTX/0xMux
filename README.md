# 0xMux

Hacker-grade tmux session manager with web UI.

```
  ██████╗ ██╗  ██╗███╗   ███╗██╗   ██╗██╗  ██╗
 ██╔═████╗╚██╗██╔╝████╗ ████║██║   ██║╚██╗██╔╝
 ██║██╔██║ ╚███╔╝ ██╔████╔██║██║   ██║ ╚███╔╝
 ████╔╝██║ ██╔██╗ ██║╚██╔╝██║██║   ██║ ██╔██╗
 ╚██████╔╝██╔╝ ██╗██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
```

Manage tmux sessions from your browser. Real-time updates via WebSocket. Works on PC and mobile.

## Install

```sh
# npx (one-time run)
npx 0xmux

# npm (global install)
npm install -g 0xmux
0xmux

# Homebrew (macOS)
brew install user/0xmux/0xmux
0xmux
```

Open `http://localhost:1234`

## Stack

- **Backend:** Rust + Axum + WebSocket
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Build:** Single binary with embedded frontend (rust-embed)

## Development

```sh
git clone https://github.com/user/0xMux.git
cd 0xMux
cd web && bun install && cd ..
bun install
bun run dev
```

This starts both frontend (`:3000`) and backend (`:3001`) with hot reload.

## Build

```sh
bun run build
./server/target/release/oxmux-server
```

## Project Structure

```
0xMux/
├── package.json           # Monorepo scripts
├── server/                # Rust backend (Axum)
│   └── src/
│       ├── main.rs        # HTTP + WebSocket server
│       ├── tmux.rs        # tmux CLI interaction
│       ├── system.rs      # Dependency detection & install
│       ├── config.rs      # CLI args (clap)
│       ├── error.rs       # Unified error handling
│       ├── banner.rs      # Terminal ASCII art
│       └── static_files.rs # Embedded frontend (prod)
├── web/                   # React frontend
│   └── src/
│       ├── App.tsx
│       ├── components/    # SessionCard, SetupWizard, etc.
│       ├── hooks/         # useWebSocket, useSessions, useDeps
│       └── lib/           # API client, TypeScript types
├── npm/                   # npm distribution package
└── homebrew/              # Homebrew formula
```

## Features

- [x] Session list with live WebSocket updates
- [x] Create / kill / rename sessions
- [x] Responsive grid (PC 3-col / tablet 2-col / mobile 1-col)
- [x] Dependency detection & guided installation
- [x] Single binary distribution (npm / Homebrew)
- [x] Neon-green hacker UI theme
- [ ] Embedded terminal (xterm.js)
- [ ] Claude Code integration

## License

MIT

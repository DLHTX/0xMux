# 0xMux Architecture

## tmux Concept Mapping

0xMux is a web-based tmux session manager. It maps tmux's three-level hierarchy
to the UI, with one deliberate simplification: **tmux panes are not managed by
the frontend**.

```
tmux hierarchy          0xMux UI
─────────────           ──────────────────────────────
Server                  (implicit — one tmux server)
└── Session             Sidebar folder (collapsible)
    └── Window          Sidebar child item (clickable / draggable)
        └── Pane        NOT used — each window has exactly 1 pane
```

### Why skip tmux panes?

`tmux attach-session -t session:window` renders the **entire window** (all its
panes) as a single terminal stream. There is no way to attach to an individual
tmux pane and get its output independently. To control split layout in the
browser, the frontend manages its own panel system instead.

### The three layers in practice

| tmux concept | What it is in 0xMux | Created by |
|---|---|---|
| **Session** | A project workspace (sidebar folder) | User clicks "+" or `CreateSessionModal` |
| **Window** | An independent terminal shell (sidebar item) | Splitting a panel, or clicking "+" on a session |
| **Pane** | Unused by 0xMux | (User can still use `Ctrl+B %` inside xterm.js) |

---

## Frontend Split Layout

The frontend implements its own split-panel system using `react-resizable-panels`.
Each panel independently connects to a tmux `session:window` via a dedicated
WebSocket → PTY → `tmux attach-session -t session:window`.

```
┌──────────────────────────────────────────┐
│  SplitWorkspace (react-resizable-panels) │
│  ┌──────────────┬───────────────────┐    │
│  │  UI Panel A  │  UI Panel B       │    │
│  │              │                   │    │
│  │  WS → PTY → │  WS → PTY →      │    │
│  │  session0:0  │  session0:1       │    │
│  └──────────────┴───────────────────┘    │
└──────────────────────────────────────────┘
```

### Key behaviors

1. **Split = creates a tmux window**
   `splitPane()` calls `tmux new-window` in the active panel's session and
   assigns the new window to the new panel. This keeps the sidebar's window
   list in sync with the visible panels.

2. **Click session header = switch workspace layout**
   `switchSession()` saves the current layout (panel tree + window assignments)
   under the current primary session, then restores the target session's saved
   layout. First visit creates a single-panel view with window 0.

3. **Click specific window = assign to active panel**
   `selectWindow()` replaces the active panel's connection. This allows mixing
   windows from different sessions in one layout.

4. **Drag window from sidebar = drop onto any panel**
   `WindowItem` sets `text/window-key` (`session:windowIndex`) on drag. Panels
   accept the drop and call `assignWindow()`.

### Layout history

Layout snapshots are stored per session name in a `Map<string, LayoutState>`:

```typescript
interface LayoutState {
  layout: SplitLayout          // recursive panel tree
  paneWindowMap: Record<string, PaneWindow>  // panel ID → {session, window}
  activePaneId: string | null
}
```

Switching sessions saves → restores these snapshots so the user sees the same
panel arrangement when returning to a session.

---

## Data Flow

```
┌─────────────┐   REST    ┌─────────────────┐   CLI    ┌──────────┐
│  React App  │ ────────→ │  Rust (Axum)    │ ───────→ │  tmux    │
│  (Vite)     │ ←──────── │  server/        │ ←─────── │  server  │
└──────┬──────┘           └────────┬────────┘          └──────────┘
       │ WebSocket                 │ PTY (portable-pty)
       │  /ws/pty                  │ tmux attach-session -t S:W
       └───────────────────────────┘
```

### REST API

| Endpoint | Purpose |
|---|---|
| `GET /api/sessions` | List sessions |
| `POST /api/sessions` | Create session |
| `DELETE /api/sessions/{name}` | Kill session |
| `GET /api/sessions/{name}/windows` | List windows |
| `POST /api/sessions/{name}/windows` | Create window |
| `DELETE /api/sessions/{name}/windows/{idx}` | Kill window |

### WebSocket

| Endpoint | Purpose |
|---|---|
| `WS /ws/pty?session=S&window=W&cols=C&rows=R` | PTY terminal stream |
| `WS /ws` | Session update push notifications |

---

## Project Structure

```
0xMux/
├── server/                     Rust backend (Axum)
│   └── src/
│       ├── services/tmux.rs    tmux CLI wrapper (list/create/kill session/window)
│       ├── ws/pty.rs           WebSocket → PTY → tmux attach
│       ├── handlers/           REST API handlers
│       └── models/             Data structures
│
├── web/                        React frontend (Vite + TypeScript)
│   └── src/
│       ├── hooks/
│       │   ├── useSplitLayout.ts   Panel layout tree + session switching + split
│       │   ├── usePtySocket.ts     WebSocket connection to PTY
│       │   ├── useSessions.ts      Session list + real-time updates
│       │   └── useTerminal.ts      xterm.js instance management
│       ├── components/
│       │   ├── session/            Sidebar: SessionSidebar → SessionFolder → WindowItem
│       │   └── terminal/           Workspace: SplitWorkspace → TerminalPane
│       └── lib/
│           ├── types.ts            Shared TypeScript interfaces
│           ├── api.ts              REST API client
│           └── session-utils.ts    extractProjectName / getProjectColor
│
└── spec/                       Feature specifications
```

---

## Session Naming Convention

When creating a session, the user picks a directory. The backend generates a
name from the directory basename with an auto-incrementing suffix:

```
Directory: ~/Documents/myproject
Session:   myproject-01, myproject-02, ...
```

`extractProjectName()` strips the `-NN` suffix to derive a "project name" used
for consistent color coding across sessions of the same project.

---

## Backend: ensure_pane_alive

Before attaching a PTY to a tmux window, the backend checks if the target
window's pane is dead (e.g. shell crashed on startup) and respawns it:

```rust
// Uses the full "session:window" target, not just session name
ensure_pane_alive("myproject-01:2")
```

This runs on a blocking thread with up to 2 retry attempts before reporting
failure to the WebSocket client.

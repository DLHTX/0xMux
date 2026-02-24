# Feature Spec: AI Agent Desktop Automation (oxmux-agent)

**Feature ID**: 2-agent-desktop-automation
**Status**: Draft
**Created**: 2026-02-15

---

## 1. Overview

0xMux is a web-based tmux session manager. As AI coding agents (Claude Code, OpenClaw, etc.) become mainstream, users increasingly need their terminal management tool to also serve as an **AI agent control plane** — enabling automated desktop operations, scheduled tasks, and browser interactions from a unified interface.

This feature introduces an independent `oxmux-agent` module that gives AI agents the ability to control the user's desktop: take screenshots, simulate keyboard/mouse input, read UI element trees, manage windows, launch applications, automate browsers, and run scheduled tasks. All operations are exposed via REST API, accessible from both the 0xMux frontend and external AI agents.

The core design principle is **UI tree first, vision fallback** — preferring structured accessibility tree data for precise element targeting, with screenshot-based visual recognition as a fallback. All screenshot data carries HiDPI scale factor metadata to solve the coordinate mismatch problem (physical pixels vs logical points) that plagues existing MCP-based solutions.

### Target Users

- AI agents (Claude Code, OpenClaw, custom agents) that need to control the user's desktop
- Developers who want to automate repetitive desktop workflows via 0xMux
- Users who need scheduled automation tasks (monitoring, reporting, periodic operations)

### Problem Statement

Current MCP-based desktop automation tools (codriver-mcp, Playwright MCP) suffer from three critical issues:
1. **Coordinate mismatch**: Screenshots return physical pixel coordinates but click APIs use logical coordinates, causing 2x offset on HiDPI/Retina displays
2. **Reliability**: MCP servers run as separate processes that can crash, disconnect, or fail silently
3. **Installation friction**: Require Node.js runtime and npm package management, adding complexity to a Rust-based tool

An integrated, native Rust solution eliminates these issues — single binary deployment, no runtime dependencies, and correct coordinate handling by design.

---

## 2. User Scenarios

### Scenario 1: AI Agent Opens an Application

**As an** AI agent running inside a 0xMux terminal session,
**I want to** launch a desktop application and interact with it,
**So that** I can complete tasks that require GUI interaction (e.g., opening a design file, launching a browser).

**Flow:**
1. AI agent sends `POST /api/agent/desktop/launch` with app name
2. System launches the application using platform-native method
3. AI agent polls `GET /api/agent/desktop/windows` to confirm the app window appeared
4. AI agent requests a screenshot or UI tree of the new window
5. AI agent identifies target UI elements and interacts with them

### Scenario 2: AI Agent Browses a Website

**As an** AI agent,
**I want to** open a browser, navigate to a URL, and extract or interact with page content,
**So that** I can gather information or perform web-based tasks.

**Flow:**
1. AI agent sends `POST /api/agent/browser/navigate` with URL
2. System manages a dedicated browser instance (Playwright)
3. AI agent requests `GET /api/agent/browser/snapshot` to get ARIA accessibility tree
4. AI agent identifies elements by ref ID (e.g., search box, button)
5. AI agent sends `POST /api/agent/browser/click` with ref ID
6. AI agent sends `POST /api/agent/browser/type` with text input

### Scenario 3: Scheduled Desktop Monitoring

**As a** user,
**I want to** schedule a recurring task that takes screenshots and checks for specific conditions,
**So that** I can monitor a long-running process or dashboard without manual checking.

**Flow:**
1. User creates a cron job via `POST /api/agent/cron` with schedule "every 30 minutes"
2. The job action is "take screenshot of primary monitor and send notification"
3. Every 30 minutes, the system captures a screenshot
4. Screenshot is stored and a notification is pushed through the existing notification system
5. User reviews screenshots from the notification panel

### Scenario 4: AI Agent Reads UI Elements

**As an** AI agent,
**I want to** read the accessibility tree of the currently focused application,
**So that** I can understand what UI elements are available and interact with them precisely without relying on screenshot coordinate guessing.

**Flow:**
1. AI agent sends `GET /api/agent/desktop/ui-tree`
2. System reads the platform accessibility tree (AXUIElement on macOS, UIAutomation on Windows)
3. Returns structured list of elements with ref ID, role, name, bounds (logical coordinates)
4. AI agent identifies the target element (e.g., ref "e5", role "button", name "Submit")
5. AI agent sends `POST /api/agent/desktop/click` with `ref: "e5"`
6. System calculates element center from bounds and clicks — no DPI conversion needed

### Scenario 5: One-Time Delayed Task

**As a** user,
**I want to** schedule a command to run at a specific future time,
**So that** I can set up deployments or maintenance tasks to run during off-hours.

**Flow:**
1. User creates a one-shot job via `POST /api/agent/cron` with schedule `{ "at": "2026-02-16T03:00:00+08:00" }`
2. Action is `{ "command": "deploy.sh", "args": ["production"] }`
3. At the specified time, the system executes the command
4. Execution result (stdout, stderr, exit code) is captured
5. A notification is sent with the result summary
6. Job is automatically marked as completed

---

## 3. Functional Requirements

### FR-1: Screenshot with HiDPI Metadata

- **FR-1.1**: The system shall capture screenshots of the primary monitor or a specified monitor
- **FR-1.2**: Every screenshot shall include metadata: physical dimensions, logical dimensions, and scale factor
- **FR-1.3**: The system shall support capturing a specific window by title (substring match)
- **FR-1.4**: The system shall support capturing a rectangular region (specified in logical coordinates)
- **FR-1.5**: Screenshots shall be returned as PNG or JPEG with configurable quality
- **FR-1.6**: The system shall enumerate all connected displays with their IDs, names, and scale factors

### FR-2: Keyboard and Mouse Input

- **FR-2.1**: The system shall simulate mouse clicks (left, right, middle) at specified logical coordinates
- **FR-2.2**: The system shall simulate mouse double-click
- **FR-2.3**: The system shall simulate mouse drag from one point to another
- **FR-2.4**: The system shall simulate keyboard text input (full Unicode support)
- **FR-2.5**: The system shall simulate key press and key combinations (e.g., Ctrl+C, Cmd+Tab)
- **FR-2.6**: All mouse coordinates shall be in logical points (the system handles any necessary conversion internally)

### FR-3: UI Tree (Accessibility)

- **FR-3.1**: The system shall read the accessibility tree of the frontmost window or a specified application
- **FR-3.2**: Each element shall include: ref ID, role, name, value, and bounding rect (logical coordinates)
- **FR-3.3**: The system shall support filtering to show only interactive elements (buttons, text fields, etc.)
- **FR-3.4**: The system shall support configurable tree depth limit
- **FR-3.5**: The system shall support clicking an element by ref ID (using element center from bounds)
- **FR-3.6**: The system shall support typing into an element by ref ID
- **FR-3.7**: The system shall support searching elements by name, role, or value substring
- **FR-3.8**: On macOS, the system shall use AXUIElement API
- **FR-3.9**: On Windows, the system shall use UIAutomation API

### FR-4: Window Management

- **FR-4.1**: The system shall list all open windows with title, app name, position, size, and window ID
- **FR-4.2**: The system shall focus (bring to front) a window by title substring match
- **FR-4.3**: The system shall launch an application by name
- **FR-4.4**: The system shall close an application by name (graceful quit)
- **FR-4.5**: The system shall check if a specific application is currently running

### FR-5: System Command Execution

- **FR-5.1**: The system shall execute shell commands and return stdout, stderr, and exit code
- **FR-5.2**: The system shall support configurable timeout per command (default 120 seconds, max 600 seconds)
- **FR-5.3**: The system shall support environment variable passthrough with dangerous variable filtering
- **FR-5.4**: Command output shall be limited to 200KB to prevent memory issues
- **FR-5.5**: The system shall support running commands in background mode with async result retrieval

### FR-6: Coordinate Mapping

- **FR-6.1**: The system shall provide a utility to convert physical pixel coordinates to logical coordinates given a scale factor
- **FR-6.2**: All APIs accepting coordinates shall use logical coordinate space
- **FR-6.3**: All APIs returning coordinates (UI tree bounds, window positions) shall use logical coordinate space
- **FR-6.4**: Screenshot API responses shall include both physical and logical dimensions plus scale factor
- **FR-6.5**: The system shall correctly handle multi-monitor setups where each monitor may have a different scale factor

### FR-7: Cron Scheduler

- **FR-7.1**: The system shall support three schedule types: one-time (`at`), fixed interval (`every`), and cron expression
- **FR-7.2**: Cron expressions shall follow standard 6-field format (second, minute, hour, day, month, weekday)
- **FR-7.3**: The system shall support timezone-aware scheduling
- **FR-7.4**: Jobs shall persist across server restarts via JSON file storage
- **FR-7.5**: The system shall recover missed jobs on restart (execute if missed window is within 5 minutes)
- **FR-7.6**: The system shall implement exponential backoff for consecutively failing jobs (max 1 hour delay)
- **FR-7.7**: Jobs exceeding 10 consecutive failures shall be automatically disabled with a notification
- **FR-7.8**: The system shall support CRUD operations on jobs (create, read, update, delete)
- **FR-7.9**: The system shall support manual trigger of any job (run now)
- **FR-7.10**: The system shall support enabling/disabling individual jobs without deletion
- **FR-7.11**: Job execution results shall be delivered through the existing notification system

### FR-8: Cron Job Actions

- **FR-8.1**: Job action `RunCommand` shall execute a shell command with specified arguments
- **FR-8.2**: Job action `OpenApp` shall launch a specified application
- **FR-8.3**: Job action `OpenUrl` shall open a URL in the managed browser instance
- **FR-8.4**: Job action `Screenshot` shall capture a screenshot and attach it to the notification
- **FR-8.5**: Job action `Custom` shall execute a user-provided script file

### FR-9: Browser Automation (Optional Module)

- **FR-9.1**: The system shall manage a dedicated browser instance (Chromium) via Playwright
- **FR-9.2**: The system shall support page navigation, back, forward, and reload
- **FR-9.3**: The system shall capture ARIA accessibility snapshots of the current page
- **FR-9.4**: The system shall support clicking, typing, hovering, and dragging page elements by ref ID
- **FR-9.5**: The system shall support taking page screenshots (viewport or full page)
- **FR-9.6**: The system shall support evaluating JavaScript on the page
- **FR-9.7**: The system shall support tab management (list, create, close, switch)
- **FR-9.8**: The system shall support form filling with structured field data
- **FR-9.9**: Browser automation shall be an optional feature, disabled by default, enabled via feature flag

---

## 4. Non-Functional Requirements

### Performance

- **NFR-1**: Screenshot capture shall complete within 500ms including metadata attachment
- **NFR-2**: UI tree reading shall complete within 1 second for applications with up to 500 elements
- **NFR-3**: Mouse click and keyboard input simulation shall have less than 50ms latency
- **NFR-4**: Cron scheduler tick resolution shall be 1 second

### Security

- **NFR-5**: All agent APIs shall require authentication (existing auth system)
- **NFR-6**: Command execution shall filter dangerous environment variables (NODE_OPTIONS, DYLD_*, LD_PRELOAD, etc.)
- **NFR-7**: Command output shall be size-limited to prevent memory exhaustion
- **NFR-8**: File paths in command execution shall be validated against traversal attacks

### Reliability

- **NFR-9**: Cron job state shall survive server crashes and restarts without data loss
- **NFR-10**: Failed browser automation operations shall not crash the main server process
- **NFR-11**: Platform-specific feature absence shall degrade gracefully (e.g., no UI tree on unsupported platform returns empty result, not an error)

### Compatibility

- **NFR-12**: Desktop automation (screenshot, input, UI tree, windows) shall work on macOS and Windows
- **NFR-13**: Cron scheduler shall work on all platforms (macOS, Windows, Linux)
- **NFR-14**: Browser automation shall work on all platforms where Playwright is supported

### Architecture

- **NFR-15**: The agent module shall be an independent Rust crate (`oxmux-agent`) in a separate directory
- **NFR-16**: The server shall include the agent module via Cargo feature flag (`agent`)
- **NFR-17**: Platform-specific code shall be isolated using `#[cfg(target_os)]` conditional compilation
- **NFR-18**: The agent module shall have zero impact on server binary size when the feature flag is disabled

---

## 5. Success Criteria

1. An AI agent can take a screenshot and receive correct scale factor metadata, enabling accurate coordinate mapping on both standard and HiDPI displays
2. An AI agent can read the UI tree, identify an element by name, and click it — completing the full perception-action loop within 2 seconds
3. Users can create, manage, and monitor scheduled tasks through the API, with jobs reliably executing within 5 seconds of their scheduled time
4. Cron jobs survive server restarts without loss, and missed jobs are recovered automatically
5. The same AI agent code can operate on both macOS and Windows through the unified API without platform-specific logic
6. The agent module adds zero overhead to the server when compiled without the `agent` feature flag
7. Browser automation allows an AI agent to navigate to a website, read its structure, and interact with elements through ref-based targeting

---

## 6. Scope Boundaries

### In Scope

- Screenshot capture with HiDPI metadata (all platforms)
- Keyboard and mouse simulation (all platforms)
- UI accessibility tree reading (macOS AXUIElement, Windows UIAutomation)
- Window listing, focusing, and app launching (all platforms)
- System command execution with safety controls
- Coordinate mapping utilities (physical to logical)
- Cron scheduler with three schedule types and JSON persistence
- Cron job actions: command, app launch, URL open, screenshot
- Browser automation via Playwright subprocess (optional)
- REST API exposure of all capabilities
- Integration with existing notification system for job results

### Out of Scope

- AI/LLM inference — the module provides tools, not intelligence
- OCR (optical character recognition) — may be added in future
- Screen recording / video capture
- Remote desktop control across machines
- Mobile device automation (iOS/Android)
- Natural language command parsing — AI agent handles this
- GUI frontend for desktop automation (API-only for now)
- Linux accessibility tree (X11/Wayland AT-SPI) — may be added in future
- Playwright installation management — assumes pre-installed

---

## 7. Assumptions

1. The server process has accessibility permissions granted by the user (macOS: System Settings > Privacy > Accessibility; Windows: run as admin or UIAutomation permissions)
2. On macOS, Screen Recording permission is granted for screenshot functionality
3. Playwright and a Chromium browser are pre-installed on the system for browser automation features
4. The existing 0xMux authentication system protects all agent API endpoints
5. AI agents consuming the API understand JSON request/response format
6. The user's machine has sufficient resources to run a Chromium instance alongside the server (for browser automation)
7. The server runs with the user's permissions and can launch applications the user has access to

---

## 8. Key Entities

| Entity | Description |
|--------|-------------|
| AnnotatedScreenshot | Screenshot image data bundled with physical dimensions, logical dimensions, and scale factor |
| UIElement | An accessibility tree node with ref ID, role, name, value, and logical bounding rect |
| UITree | The full or filtered accessibility tree for a window or application |
| WindowInfo | An open window's metadata: title, app name, position, size, window ID, monitor ID |
| MonitorInfo | A connected display's metadata: ID, name, logical size, physical size, scale factor |
| CronJob | A scheduled task with ID, name, schedule, action, enabled state, and execution history |
| CronSchedule | One of: At (one-time), Every (interval), Cron (expression with timezone) |
| CronAction | One of: RunCommand, OpenApp, OpenUrl, Screenshot, Custom |
| JobResult | Execution outcome: status (ok/error), output, duration, timestamp |
| CoordinateMapper | Utility that converts between physical pixel and logical point coordinate spaces |
| BrowserSession | A managed Playwright browser instance with page state and tab management |
| PageSnapshot | ARIA accessibility tree of a browser page with ref-tagged interactive elements |

---

## 9. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| enigo 0.6 | Rust crate | Cross-platform keyboard and mouse simulation |
| xcap 0.8 | Rust crate | Cross-platform screenshot capture with monitor info |
| tokio-cron-scheduler 0.15 | Rust crate | Async cron job scheduling on tokio runtime |
| accessibility-sys (macOS) | Rust crate | AXUIElement FFI bindings for macOS accessibility tree |
| uiautomation 0.24 (Windows) | Rust crate | Windows UIAutomation API bindings |
| windows-rs 0.58 (Windows) | Rust crate | Windows API bindings for window management |
| Playwright | External | Browser automation (optional, managed as subprocess) |
| Existing auth system | Internal | Authentication for all agent API endpoints |
| Existing notification system | Internal | Delivery channel for cron job results |

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| macOS accessibility permission not granted | UI tree and input simulation fail silently | Detect permission status on startup, warn user via notification |
| Windows UAC blocks automation | Input simulation blocked for elevated windows | Document requirement, detect and warn |
| Playwright process crashes | Browser automation unavailable | Isolate in subprocess, auto-restart with backoff |
| Cron job runs dangerous command | System damage or data loss | Command output limits, environment variable filtering, job audit log |
| HiDPI scale factor changes mid-session (monitor plug/unplug) | Coordinate mapping becomes stale | Re-query scale factor before each operation, do not cache |
| enigo/xcap crate compatibility breaks on OS update | Desktop automation fails | Pin crate versions, test on CI with multiple OS versions |
| Large UI trees cause memory pressure | Slow response or OOM | Configurable depth limit, element count cap (default 1000) |

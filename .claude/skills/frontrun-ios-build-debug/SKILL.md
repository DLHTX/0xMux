---
name: frontrun-ios-build-debug
description: iOS Build & Debug workflow for Frontrun iOS development. Use this skill when you need to build, run, debug, or monitor the Frontrun iOS app. Handles complete build-test-debug cycles including log monitoring, screenshot capture, video recording, and real-time debugging workflows.
---

# iOS Build & Debug Skill

Complete workflow for building, running, and debugging the Frontrun iOS app.

## When to Use

Use this skill when the user requests any of:
- Building and running the app
- Monitoring app logs
- Debugging issues (charts, WebSocket, UI, etc.)
- Taking screenshots or recording video
- Analyzing performance and errors
- Quick verification of code changes

## Prerequisites

- Xcode installed and configured
- Simulator available or physical device connected
- XcodeBuild MCP Server enabled
- Project at: `/Users/koray/Documents/GitHub/frontrun-ios-private`

### App Identity

- **Process / Display name**: `Frontrun` (NOT Telegram!)
- **Bundle ID**: `org.4016f7c4abce0926.Telegram` (historical suffix retained)
- When using `killall`, `ps aux | grep`, etc., search for **Frontrun** not Telegram — avoid killing real Telegram process

## Quick Start

### Choosing the Right Build Method

**During debugging (development):**
- Use **run.sh script** for the initial full build
- Use **XcodeBuild MCP** for fast incremental builds and testing

**After debugging (verification):**
1. **Must use run.sh first** for a full build to catch compilation errors
2. **Then use XcodeBuild MCP** for final functional testing

### Method 1: run.sh Script (full build, required before and after debugging)

```bash
# Simulator build (default)
./scripts/run.sh

# Physical device build
./scripts/run.sh --device

# Clean rebuild
./scripts/run.sh --clean

# Release build
./scripts/run.sh --dist --release --skip-install --upload
```

**When to use run.sh:**
- Before starting a new debug session
- After modifying multiple files
- Before committing code after debugging
- When encountering odd compilation errors

### Method 2: XcodeBuild MCP (incremental build, fast iteration during debugging)

**Build and run:**
```typescript
mcp__XcodeBuildMCP__build_run_sim({})
```

**Build only (no launch):**
```typescript
mcp__XcodeBuildMCP__build_sim({})
```

**Launch an already-installed app:**
```typescript
mcp__XcodeBuildMCP__launch_app_sim({
  bundleId: "org.4016f7c4abce0926.Telegram"
})
```

**When to use XcodeBuild MCP:**
- Quick verification of small changes
- Frequent testing during debugging
- When screenshot, recording, or other debug features are needed

## Log Monitoring Workflow

### Real-Time Log Monitoring (Recommended)

```bash
# Start background log monitoring
xcrun simctl spawn booted log stream --level debug 2>&1 | \
    grep --line-buffered -E "MiniChart|InlineTradingWidget|OKXWebSocket|YourKeyword" \
    > /tmp/app_logs.txt &

LOG_PID=$!
echo "Log monitoring started (PID: $LOG_PID)"

# Wait for operations to complete
sleep 30

# Stop monitoring
kill $LOG_PID 2>/dev/null

# View logs
cat /tmp/app_logs.txt
```

### Using XcodeBuild MCP Log Capture

```typescript
// 1. Start capture
const session = mcp__XcodeBuildMCP__start_sim_log_cap({
  bundleId: "org.4016f7c4abce0926.Telegram",
  captureConsole: true
})
// Returns: { logSessionId: "session-123" }

// 2. Perform test operations...

// 3. Stop capture and retrieve logs
mcp__XcodeBuildMCP__stop_sim_log_cap({
  logSessionId: "session-123"
})
```

## Common Debug Commands

### Log Analysis

```bash
# Find error logs
grep -E "ERROR|Failed" /tmp/app_logs.txt

# Find chart-related logs
grep -E "MiniChart" /tmp/app_logs.txt

# Find WebSocket logs
grep -E "WebSocket|OKX" /tmp/app_logs.txt
```

### App State Management

```bash
# Get running app PID (note: process name is Frontrun, not Telegram)
ps aux | grep Frontrun | grep -v grep

# Stop app (command line)
xcrun simctl spawn booted killall Frontrun

# Stop app (MCP)
mcp__XcodeBuildMCP__stop_app_sim({
  bundleId: "org.4016f7c4abce0926.Telegram"
})
```

### Screenshots and Recording

```typescript
// Take screenshot
mcp__XcodeBuildMCP__screenshot({})

// Start recording
mcp__XcodeBuildMCP__record_sim_video({
  start: true,
  fps: 30
})

// Stop recording
mcp__XcodeBuildMCP__record_sim_video({
  stop: true,
  outputFile: "/tmp/recording.mp4"
})
```

## Quick Verification of Code Changes

```bash
# After modifying code, check compilation first
./scripts/run.sh --skip-install  # Build only, no install

# If compilation passes, do a full run
./scripts/run.sh
```

### Timestamped Log Persistence

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
xcrun simctl spawn booted log stream --level debug 2>&1 | \
    grep --line-buffered "keyword" \
    > "/tmp/logs_${TIMESTAMP}.txt" &
```

### Performance Analysis

```typescript
// Get app performance metrics and UI hierarchy
mcp__XcodeBuildMCP__describe_ui({})
```

### Multi-Device Testing

```bash
# List all booted simulators
xcrun simctl list devices | grep Booted

# Build for a specific device
./scripts/run.sh --device=<UDID>
```

## Troubleshooting

### Build Failure

```bash
# Clean build cache
./scripts/run.sh --clean

# Or use XcodeBuild MCP
mcp__XcodeBuildMCP__clean({})
```

### Simulator Unresponsive

```bash
# Restart simulator
xcrun simctl shutdown all
xcrun simctl boot <DEVICE_ID>

# Or use MCP
mcp__XcodeBuildMCP__boot_sim({})
```

### Log Capture Failure

```bash
# Check processes
ps aux | grep "log stream"

# Kill stuck processes
pkill -f "log stream"

# Restart monitoring
xcrun simctl spawn booted log stream --level debug 2>&1 | \
    grep --line-buffered "keyword" > /tmp/app_logs.txt &
```

### App Installation Failure

```bash
# Uninstall old version
xcrun simctl uninstall booted org.4016f7c4abce0926.Telegram

# Reinstall
./scripts/run.sh
```

## Standard Debug Workflow

```
1. Initial build        → ./scripts/run.sh
   ↓
2. Monitor logs         → Start background log monitoring
   ↓
3. Test functionality   → Perform operations in the app
   ↓
4. Analyze issues       → Filter logs with grep, locate bugs
   ↓
5. Modify code          → Edit Swift/Objective-C files
   ↓
6. Quick verify         → mcp__XcodeBuildMCP__build_run_sim (incremental)
   ↓
7. Repeat 3-6 until issue resolved
   ↓
8. Final verify         → ./scripts/run.sh (full build)
   ↓
9. Full test            → XcodeBuild MCP interactive testing
   ↓
10. Commit code
```

### Post-Debug Mandatory Steps

**Before committing code or marking an issue resolved, you must run a full interactive test:**

#### Step 1: Full Rebuild

```bash
# Full rebuild (catch hidden compilation issues)
./scripts/run.sh
```

#### Step 2: XcodeBuild MCP Interactive Testing (Required!)

1. **Launch app and take baseline screenshot**
2. **Start log capture** with `start_sim_log_cap`
3. **Get UI hierarchy and coordinates** with `describe_ui` — never guess coordinates!
4. **Execute UI interaction tests** with `tap` and `gesture`
5. **Verify real-time updates** (wait for WebSocket, screenshot after)
6. **Stop logs and analyze** — check for expected markers, confirm no errors
7. **Compare screenshots** — before vs after, confirm fix is working

**Verification Checklist (all must pass):**
- run.sh full build succeeded with no compilation errors
- App launches normally
- Used `describe_ui` to get actual UI coordinates
- Used `tap` and `gesture` for automated interaction
- Took screenshots at multiple key states
- Fixed functionality works correctly
- No regression in related features
- No new errors or warnings in logs
- UI displays correctly, no layout issues

### Important Reminders

- Never guess UI coordinates — always use `describe_ui` for accurate coordinates
- Never skip screenshots — before/after comparison is key evidence of a fix
- Never rely on manual testing alone — use `tap` and `gesture` for automated UI interaction
- Never ignore logs — log markers are critical for verifying code paths

## Quick Iteration During Debugging

```bash
# Quick verify after code changes
mcp__XcodeBuildMCP__build_sim({})
mcp__XcodeBuildMCP__launch_app_sim({
  bundleId: "org.4016f7c4abce0926.Telegram"
})

# Check latest logs
tail -50 /tmp/app_logs.txt
```

## Debug Session Checklist

**At session start:**
- [ ] Full build with `./scripts/run.sh`
- [ ] Confirm app launches normally
- [ ] Start background log monitoring

**During debugging:**
- [ ] Use XcodeBuild MCP for incremental builds (fast iteration)
- [ ] Verify functionality after each change
- [ ] Keep log monitoring running
- [ ] Record key findings and modifications

**At session end (important!):**
- [ ] Full build with `./scripts/run.sh`
- [ ] Confirm no compilation errors or warnings
- [ ] Full functional test with XcodeBuild MCP
- [ ] Use `describe_ui` to get UI element coordinates
- [ ] Use `tap` and `gesture` for automated UI testing
- [ ] Take screenshots at multiple key states (before/after comparison)
- [ ] Verify fixed functionality works correctly
- [ ] Verify no regression in related features
- [ ] Check logs for no new errors
- [ ] Analyze log conversion markers and data flow
- [ ] UI displays correctly, no layout issues
- [ ] Commit code or mark issue as resolved

## Reference Files

- Main docs: `/Users/koray/Documents/GitHub/frontrun-ios-private/CLAUDE.md`
- Build script: `/Users/koray/Documents/GitHub/frontrun-ios-private/scripts/run.sh`
- Debug guide: `.claude/debug-chart-clearing-issue.md` (chart-specific)

## XcodeBuild MCP Tool Quick Reference

### Build and Run
- `build_sim({})` — Incremental build
- `build_run_sim({})` — Build and run
- `launch_app_sim({bundleId})` — Launch app
- `stop_app_sim({bundleId})` — Stop app

### Logging and Debug
- `start_sim_log_cap({bundleId, captureConsole})` — Start log capture
- `stop_sim_log_cap({logSessionId})` — Stop log capture
- `screenshot({filename?})` — Take screenshot (optional filename)
- `record_sim_video({start, stop, outputFile})` — Record video
- `describe_ui({})` — **Get UI hierarchy and element coordinates (essential!)**

### UI Interaction (Required for Automated Testing)
- `tap({x, y, preDelay?, postDelay?})` — **Tap at coordinates**
- `long_press({x, y, duration})` — Long press
- `swipe({x1, y1, x2, y2, duration?})` — Swipe gesture
- `gesture({preset, delta?, duration?})` — Preset gesture (scroll-up/down/left/right, swipe-from-*-edge)
- `type_text({text})` — Type text
- `button({buttonType, duration?})` — Press hardware button (home, lock, siri, etc.)

### Utilities
- `list_sims({})` — List all simulators
- `boot_sim({})` — Boot simulator
- `clean({})` — Clean build cache

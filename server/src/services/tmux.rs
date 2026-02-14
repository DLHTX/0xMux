use crate::error::AppError;
use crate::models::session::TmuxSession;
use crate::models::window::TmuxWindow;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::{LazyLock, OnceLock};

static SESSION_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9_.-]+$").unwrap());

/// Global tmux socket name. Set once at startup via `init_tmux_socket`.
static TMUX_SOCKET: OnceLock<Option<String>> = OnceLock::new();

/// Initialize the global tmux socket name. Call once at startup.
pub fn init_tmux_socket(socket: Option<String>) {
    TMUX_SOCKET.set(socket).ok();
}

/// Get the configured tmux socket name (if any).
pub fn get_tmux_socket() -> Option<&'static str> {
    TMUX_SOCKET.get().and_then(|s| s.as_deref())
}

/// Build a `Command` for tmux with a clean environment.
///
/// When the server is launched from an interactive shell (e.g. a terminal with
/// oh-my-zsh + Powerlevel10k), dozens of shell-theme env vars leak into child
/// processes. Inside a detached tmux session the shell sees these stale vars
/// (e.g. `_P9K_TTY` pointing to the parent's TTY), fails to initialise, and
/// exits — which destroys the session and potentially the whole tmux server.
///
/// We solve this by giving tmux a minimal, known-good environment.
/// If `--tmux-socket` was set, adds `-L <name>` to use an isolated tmux server.
pub fn tmux_cmd() -> Command {
    let mut cmd = Command::new("tmux");
    cmd.env_clear();
    // Only pass through the essentials
    for key in &[
        "HOME",
        "SHELL",
        "USER",
        "LOGNAME",
        "PATH",
        "TERM",
        "LANG",
        "LC_ALL",
        "TMPDIR",
        "XDG_RUNTIME_DIR",
    ] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    // Ensure TERM is set (tmux needs it)
    if std::env::var("TERM").is_err() {
        cmd.env("TERM", "xterm-256color");
    }
    // Use named socket for isolation if configured
    if let Some(socket) = get_tmux_socket() {
        cmd.args(["-L", socket]);
    }
    cmd
}

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.len() > 50 {
        return Err(AppError::BadRequest(
            "Session name must be 1-50 characters".to_string(),
        ));
    }
    if !SESSION_NAME_RE.is_match(name) {
        return Err(AppError::BadRequest(
            "Session name contains invalid characters".to_string(),
        ));
    }
    Ok(())
}

/// Kill orphaned `_0xmux_` grouped sessions left over from a previous server
/// crash or unclean shutdown.  Only kills sessions matching THIS instance's
/// prefix so it won't interfere with other running servers.
///
/// `prefix` is this instance's `INSTANCE_PREFIX` (e.g. `_0xmux_a1b2c3d4_`).
pub fn cleanup_orphaned_groups(prefix: &str) {
    let output = tmux_cmd()
        .args(["list-sessions", "-F", "#{session_name}"])
        .output();

    if let Ok(out) = output
        && out.status.success()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for name in stdout.lines() {
            if name.starts_with(prefix) {
                let _ = tmux_cmd().args(["kill-session", "-t", name]).status();
                tracing::info!("Cleaned up orphaned grouped session: {name}");
            }
        }
    }
}

/// Kill grouped sessions that belong to THIS instance (`prefix`) but are NOT
/// in the `active` set.  Called periodically as a safety net for cleanup
/// failures.  Never touches sessions owned by other server instances.
pub fn gc_orphaned_groups(prefix: &str, active: &HashSet<String>) {
    let output = tmux_cmd()
        .args(["list-sessions", "-F", "#{session_name}"])
        .output();

    if let Ok(out) = output
        && out.status.success()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for name in stdout.lines() {
            if name.starts_with(prefix) && !active.contains(name) {
                let _ = tmux_cmd().args(["kill-session", "-t", name]).status();
                tracing::info!("GC: reaped orphaned grouped session: {name}");
            }
        }
    }
}

pub fn list_sessions() -> Result<Vec<TmuxSession>, AppError> {
    let output = tmux_cmd()
        .args([
            "list-sessions",
            "-F",
            "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}|#{pane_current_path}",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            Ok(stdout
                .lines()
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    if parts.len() >= 4 {
                        let name = parts[0].to_string();
                        // Hide temporary grouped sessions created by PTY connections
                        if name.starts_with("_0xmux_") {
                            return None;
                        }
                        Some(TmuxSession {
                            name,
                            windows: parts[1].parse().unwrap_or(0),
                            created: parts[2].to_string(),
                            attached: parts[3] == "1",
                            start_directory: parts.get(4).unwrap_or(&"").to_string(),
                        })
                    } else {
                        None
                    }
                })
                .collect())
        }
        Ok(_) => {
            // No active sessions (server not running, no sessions, or other non-success)
            Ok(vec![])
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(vec![])
            } else {
                Err(AppError::Internal(format!("Failed to run tmux: {e}")))
            }
        }
    }
}

pub fn new_session(name: &str, start_directory: Option<&str>) -> Result<TmuxSession, AppError> {
    validate_name(name)?;

    let existing = list_sessions()?;
    if existing.iter().any(|s| s.name == name) {
        return Err(AppError::Conflict(format!(
            "Session '{name}' already exists"
        )));
    }

    let mut args = vec!["new-session", "-d", "-s", name];
    if let Some(dir) = start_directory {
        args.push("-c");
        args.push(dir);
    }
    // Enable remain-on-exit so the session survives if the shell exits
    // unexpectedly (e.g. due to .zshrc/Powerlevel10k incompatibilities in
    // detached mode). The pane stays around in "dead" state and will be
    // respawned when a PTY client connects.
    args.extend_from_slice(&[";", "set-option", "-t", name, "remain-on-exit", "on"]);

    let status = tmux_cmd()
        .args(&args)
        .status()
        .map_err(|e| AppError::Internal(format!("Failed to create session: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux new-session failed for '{name}'"
        )));
    }

    // Return the newly created session info
    let sessions = list_sessions()?;
    sessions
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| AppError::Internal("Session created but not found in list".to_string()))
}

/// Generate the next session name for a directory, e.g. `dirname-01`, `dirname-02`, ...
pub fn next_session_name(dir: &str) -> Result<String, AppError> {
    let basename = std::path::Path::new(dir)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("session");

    let existing = list_sessions()?;
    let prefix = format!("{basename}-");

    let max_num = existing
        .iter()
        .filter_map(|s| {
            s.name
                .strip_prefix(&prefix)
                .and_then(|suffix| suffix.parse::<u32>().ok())
        })
        .max()
        .unwrap_or(0);

    Ok(format!("{prefix}{:02}", max_num + 1))
}

pub fn kill_session(name: &str) -> Result<(), AppError> {
    let existing = list_sessions()?;
    if !existing.iter().any(|s| s.name == name) {
        return Err(AppError::NotFound(format!("Session '{name}' not found")));
    }

    let status = tmux_cmd()
        .args(["kill-session", "-t", name])
        .status()
        .map_err(|e| AppError::Internal(format!("Failed to kill session: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux kill-session failed for '{name}'"
        )));
    }

    Ok(())
}

pub fn rename_session(old: &str, new_name: &str) -> Result<TmuxSession, AppError> {
    validate_name(new_name)?;

    let existing = list_sessions()?;
    if !existing.iter().any(|s| s.name == old) {
        return Err(AppError::NotFound(format!("Session '{old}' not found")));
    }
    if existing.iter().any(|s| s.name == new_name) {
        return Err(AppError::Conflict(format!(
            "Session '{new_name}' already exists"
        )));
    }

    let status = tmux_cmd()
        .args(["rename-session", "-t", old, new_name])
        .status()
        .map_err(|e| AppError::Internal(format!("Failed to rename session: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux rename-session failed for '{old}' → '{new_name}'"
        )));
    }

    let sessions = list_sessions()?;
    sessions
        .into_iter()
        .find(|s| s.name == new_name)
        .ok_or_else(|| AppError::Internal("Session renamed but not found in list".to_string()))
}

pub fn list_windows(session: &str) -> Result<Vec<TmuxWindow>, AppError> {
    // Check that session exists first
    let sessions = list_sessions()?;
    if !sessions.iter().any(|s| s.name == session) {
        return Err(AppError::NotFound(format!("Session '{session}' not found")));
    }

    let output = tmux_cmd()
        .args([
            "list-windows",
            "-t",
            session,
            "-F",
            "#{window_index}|#{window_name}|#{window_active}|#{window_panes}",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to run tmux: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!(
            "tmux list-windows failed: {stderr}"
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() == 4 {
                Some(TmuxWindow {
                    index: parts[0].parse().unwrap_or(0),
                    name: parts[1].to_string(),
                    active: parts[2] == "1",
                    panes: parts[3].parse().unwrap_or(1),
                })
            } else {
                None
            }
        })
        .collect())
}

/// List all windows across all sessions in a single tmux call.
/// Returns a map from session name to its window list.
/// Used by the session watcher for efficient change detection.
pub fn list_all_windows() -> Result<HashMap<String, Vec<TmuxWindow>>, AppError> {
    let output = tmux_cmd()
        .args([
            "list-windows",
            "-a",
            "-F",
            "#{session_name}|#{window_index}|#{window_name}|#{window_active}|#{window_panes}",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to run tmux: {e}")))?;

    if !output.status.success() {
        // No sessions at all → empty result
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result: HashMap<String, Vec<TmuxWindow>> = HashMap::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 5 {
            let session_name = parts[0].to_string();
            let window = TmuxWindow {
                index: parts[1].parse().unwrap_or(0),
                name: parts[2].to_string(),
                active: parts[3] == "1",
                panes: parts[4].parse().unwrap_or(1),
            };
            result.entry(session_name).or_default().push(window);
        }
    }

    Ok(result)
}

pub fn get_target_current_path(session: &str, window: Option<u32>) -> Result<String, AppError> {
    let target = match window {
        Some(index) => format!("{session}:{index}"),
        None => session.to_string(),
    };

    let output = tmux_cmd()
        .args([
            "display-message",
            "-p",
            "-t",
            &target,
            "#{pane_current_path}",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to get pane path: {e}")))?;

    if !output.status.success() {
        return Err(AppError::BadRequest(format!(
            "Cannot resolve current path for target '{target}'"
        )));
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(AppError::BadRequest(format!(
            "Target '{target}' has empty current path"
        )));
    }
    Ok(path)
}

pub fn new_window(session: &str, name: Option<&str>) -> Result<TmuxWindow, AppError> {
    // Check that session exists first
    let sessions = list_sessions()?;
    if !sessions.iter().any(|s| s.name == session) {
        return Err(AppError::NotFound(format!("Session '{session}' not found")));
    }

    // Create in detached mode so existing attached clients don't get force-switched.
    // Print the created index directly to avoid relying on "active window" heuristics.
    let mut args = vec![
        "new-window".to_string(),
        "-d".to_string(),
        "-P".to_string(),
        "-F".to_string(),
        "#{window_index}".to_string(),
        "-t".to_string(),
        session.to_string(),
    ];

    // Keep new windows in the same working directory as the session's current pane.
    if let Ok(path) = get_target_current_path(session, None) {
        args.push("-c".to_string());
        args.push(path);
    }

    // If name is provided, validate and add -n flag
    if let Some(n) = name {
        validate_name(n)?;
        args.push("-n".to_string());
        args.push(n.to_string());
    }

    let output = tmux_cmd()
        .args(args.iter().map(String::as_str))
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to create window: {e}")))?;

    if !output.status.success() {
        return Err(AppError::Internal(format!(
            "tmux new-window failed for session '{session}'"
        )));
    }

    let index_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let created_index = index_str.parse::<u32>().map_err(|_| {
        AppError::Internal(format!(
            "tmux new-window returned invalid window index: '{index_str}'"
        ))
    })?;

    let windows = list_windows(session)?;
    windows
        .into_iter()
        .find(|w| w.index == created_index)
        .ok_or_else(|| AppError::Internal("Window created but not found in list".to_string()))
}

pub fn kill_window(session: &str, index: u32) -> Result<(), AppError> {
    let windows = list_windows(session)?;

    if windows.len() <= 1 {
        return Err(AppError::LastWindow(format!(
            "Cannot kill the last window in session '{session}'"
        )));
    }

    let target = format!("{session}:{index}");
    let status = tmux_cmd()
        .args(["kill-window", "-t", &target])
        .status()
        .map_err(|e| AppError::Internal(format!("Failed to kill window: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux kill-window failed for '{target}'"
        )));
    }

    Ok(())
}

pub fn select_window(session: &str, index: u32) -> Result<(), AppError> {
    let target = format!("{session}:{index}");
    let status = tmux_cmd()
        .args(["select-window", "-t", &target])
        .status()
        .map_err(|e| AppError::Internal(format!("Failed to select window: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux select-window failed for '{target}'"
        )));
    }

    Ok(())
}

/// Check whether the active pane in the given tmux target is dead.
/// `target` can be "session", "session:window", or "session:window.pane".
fn is_pane_dead(target: &str) -> Result<bool, AppError> {
    let output = tmux_cmd()
        .args(["display-message", "-t", target, "-p", "#{pane_dead}"])
        .output()
        .map_err(|e| AppError::Internal(format!("Failed to query pane state: {e}")))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim() == "1")
    } else {
        Ok(false)
    }
}

/// If the active pane in `target` is dead, respawn it and verify it stays
/// alive before returning.  Retries up to 2 times if the new shell exits
/// immediately (e.g. due to .zshrc incompatibilities in detached mode).
///
/// `target` accepts any tmux target format: "session", "session:window",
/// or "session:window.pane".
pub fn ensure_pane_alive(target: &str) -> Result<(), AppError> {
    if !is_pane_dead(target)? {
        return Ok(());
    }

    for attempt in 0..2 {
        tracing::info!("Respawning dead pane in '{target}' (attempt {attempt})");

        let status = tmux_cmd()
            .args(["respawn-pane", "-k", "-t", target])
            .status()
            .map_err(|e| AppError::Internal(format!("Failed to respawn pane: {e}")))?;

        if !status.success() {
            tracing::warn!("respawn-pane failed for '{target}'");
            continue;
        }

        // Give the shell a moment to initialise (or crash).
        std::thread::sleep(std::time::Duration::from_millis(500));

        if !is_pane_dead(target)? {
            return Ok(());
        }

        tracing::warn!("Pane in '{target}' died again after respawn");
    }

    // Last resort: still dead after retries — return error so the WS handler
    // can inform the client instead of attaching to a dead session.
    Err(AppError::Internal(format!(
        "Pane in '{target}' could not be revived"
    )))
}

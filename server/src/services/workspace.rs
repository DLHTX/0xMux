use crate::error::AppError;
use crate::services::{git, tmux};
use std::path::PathBuf;

/// Resolve workspace root based on current UI focus.
///
/// Priority:
/// 1) If session/window is provided: use that tmux target's pane cwd.
/// 2) Else: use server process cwd (legacy behavior).
/// 3) If cwd is inside a git repo: promote to repo top-level.
pub fn resolve_workspace_root(
    session: Option<&str>,
    window: Option<u32>,
) -> Result<PathBuf, AppError> {
    let base = match session {
        Some(session_name) => PathBuf::from(tmux::get_target_current_path(session_name, window)?),
        None => std::env::current_dir()
            .map_err(|e| AppError::Internal(format!("Cannot get cwd: {e}")))?,
    };

    let canonical = base.canonicalize().unwrap_or(base);
    Ok(git::resolve_repo_root(&canonical).unwrap_or(canonical))
}

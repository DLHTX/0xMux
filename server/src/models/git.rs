use serde::{Deserialize, Serialize};

/// Git status response
#[derive(Serialize)]
pub struct GitStatusResponse {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub files: Vec<GitChangedFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_worktree: Option<bool>,
}

/// A file with git changes
#[derive(Serialize)]
pub struct GitChangedFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i32>,
}

/// Git diff content for Monaco DiffEditor
#[derive(Serialize)]
pub struct GitDiffResponse {
    pub file_path: String,
    pub original: String,
    pub modified: String,
    pub language: String,
}

/// Git log entry
#[derive(Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refs: Option<String>,
}

/// Git branch info
#[derive(Serialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub short_hash: String,
    pub upstream: Option<String>,
    pub is_current: bool,
    pub is_remote: bool,
}

/// Git commit request
#[derive(Deserialize)]
pub struct GitCommitRequest {
    pub message: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Git commit response
#[derive(Serialize)]
pub struct GitCommitResponse {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
}

/// Git push request
#[derive(Deserialize)]
pub struct GitPushRequest {
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Git push response
#[derive(Serialize)]
pub struct GitPushResponse {
    pub success: bool,
    pub message: String,
}

/// Worktree info
#[derive(Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    pub is_main: bool,
}

/// Worktree create request
#[derive(Deserialize)]
pub struct WorktreeCreateRequest {
    /// Base branch to create from
    pub base_branch: String,
    /// New branch name
    pub new_branch: String,
    /// Directory name (relative to parent of repo root)
    pub dir_name: String,
    /// Untracked files/dirs to copy into the new worktree
    #[serde(default)]
    pub copy_paths: Vec<String>,
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Worktree remove request
#[derive(Deserialize)]
pub struct WorktreeRemoveRequest {
    /// Worktree directory path
    pub path: String,
    #[serde(default)]
    pub force: bool,
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Git stage/unstage request
#[derive(Deserialize)]
pub struct GitStageRequest {
    pub paths: Vec<String>,
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Git stage-all / unstage-all request (workspace only)
#[derive(Deserialize)]
pub struct GitStageAllRequest {
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Git checkout request
#[derive(Deserialize)]
pub struct GitCheckoutRequest {
    pub branch: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

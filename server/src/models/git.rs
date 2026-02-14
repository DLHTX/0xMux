use serde::Serialize;

/// Git status response
#[derive(Serialize)]
pub struct GitStatusResponse {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub files: Vec<GitChangedFile>,
}

/// A file with git changes
#[derive(Serialize)]
pub struct GitChangedFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
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

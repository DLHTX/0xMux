use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TmuxSession {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
    pub start_directory: String,
    /// Whether the session's working directory is a git worktree
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_worktree: bool,
    /// The common repo root shared by all worktrees of the same project.
    /// Used by the frontend to group sessions belonging to the same repo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_root: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub start_directory: Option<String>,
}

#[derive(Deserialize)]
pub struct RenameSessionRequest {
    pub name: String,
}

#[derive(Serialize)]
pub struct CwdResponse {
    pub path: String,
    pub basename: String,
}

#[derive(Serialize)]
pub struct NextNameResponse {
    pub name: String,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct ListDirsResponse {
    pub path: String,
    pub parent: Option<String>,
    pub dirs: Vec<DirEntry>,
}

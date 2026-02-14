use axum::{Json, extract::Query, response::IntoResponse};
use serde::Deserialize;
use serde_json::json;

use crate::error::AppError;
use crate::services::{git, workspace};

// ── GET /api/git/status ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WorkspaceQuery {
    pub session: Option<String>,
    pub window: Option<u32>,
}

pub async fn status_handler(
    Query(q): Query<WorkspaceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let status = git::get_status(&root)?;
    Ok(Json(status))
}

// ── GET /api/git/diff?path=&staged= ─────────────────────────────────

#[derive(Deserialize)]
pub struct DiffQuery {
    pub path: String,
    #[serde(default)]
    pub staged: bool,
    pub session: Option<String>,
    pub window: Option<u32>,
}

pub async fn diff_handler(
    Query(q): Query<DiffQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let diff = git::get_diff(&root, &q.path, q.staged)?;
    Ok(Json(diff))
}

// ── GET /api/git/log?limit= ────────────────────────────────────────

#[derive(Deserialize)]
pub struct LogQuery {
    #[serde(default = "default_log_limit")]
    pub limit: usize,
    pub session: Option<String>,
    pub window: Option<u32>,
}

fn default_log_limit() -> usize {
    20
}

pub async fn log_handler(
    Query(q): Query<LogQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let commits = git::get_log(&root, q.limit)?;
    Ok(Json(json!({ "commits": commits })))
}

// ── GET /api/git/branches ───────────────────────────────────────────

pub async fn branches_handler(
    Query(q): Query<WorkspaceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let branches = git::get_branches(&root)?;
    Ok(Json(json!({ "branches": branches })))
}

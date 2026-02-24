use axum::{Json, extract::Query, response::IntoResponse};
use serde::Deserialize;

use crate::error::AppError;
use crate::models::git::{GitCheckoutRequest, GitCommitRequest, GitPushRequest, GitStageAllRequest, GitStageRequest};
use crate::services::{git, workspace};
use serde_json::json;

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

// ── POST /api/git/commit ──────────────────────────────────────────

pub async fn commit_handler(
    Json(body): Json<GitCommitRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    let result = git::commit(&root, &body.message)?;
    Ok(Json(result))
}

// ── POST /api/git/push ────────────────────────────────────────────

pub async fn push_handler(
    Json(body): Json<GitPushRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    let result = git::push(&root)?;
    Ok(Json(result))
}

// ── POST /api/git/stage ───────────────────────────────────────────

pub async fn stage_handler(
    Json(body): Json<GitStageRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::stage(&root, &body.paths)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/unstage ─────────────────────────────────────────

pub async fn unstage_handler(
    Json(body): Json<GitStageRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::unstage(&root, &body.paths)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/stage-all ───────────────────────────────────────

pub async fn stage_all_handler(
    Json(body): Json<GitStageAllRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::stage_all(&root)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/unstage-all ─────────────────────────────────────

pub async fn unstage_all_handler(
    Json(body): Json<GitStageAllRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::unstage_all(&root)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/checkout ───────────────────────────────────────

pub async fn checkout_handler(
    Json(body): Json<GitCheckoutRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::checkout(&root, &body.branch)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/discard ────────────────────────────────────────

pub async fn discard_handler(
    Json(body): Json<GitStageRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::discard(&root, &body.paths)?;
    Ok(Json(json!({ "ok": true })))
}

// ── POST /api/git/discard-all ────────────────────────────────────

pub async fn discard_all_handler(
    Json(body): Json<GitStageAllRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    git::discard_all(&root)?;
    Ok(Json(json!({ "ok": true })))
}

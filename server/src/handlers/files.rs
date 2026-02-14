use axum::{
    Json,
    extract::Query,
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::json;

use crate::error::AppError;
use crate::models::files::{FileWriteRequest, SearchQuery};
use crate::services::{fs, search, workspace};

// ── GET /api/files/tree?path=&depth= ────────────────────────────────

#[derive(Deserialize)]
pub struct TreeQuery {
    #[serde(default)]
    pub path: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

pub async fn tree_handler(
    Query(q): Query<TreeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let path = if q.path.is_empty() { "." } else { &q.path };
    let children = fs::list_directory(&root, path)?;
    Ok(Json(json!({ "children": children })))
}

// ── GET /api/files/absolute?path= ───────────────────────────────────

#[derive(Deserialize)]
pub struct AbsolutePathQuery {
    pub path: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

pub async fn absolute_path_handler(
    Query(q): Query<AbsolutePathQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let absolute = fs::resolve_absolute_path(&root, &q.path)?;
    Ok(Json(json!({ "path": absolute.to_string_lossy().to_string() })))
}

// ── GET /api/files/read?path= ───────────────────────────────────────

#[derive(Deserialize)]
pub struct ReadQuery {
    pub path: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

pub async fn read_handler(
    Query(q): Query<ReadQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let content = fs::read_file(&root, &q.path)?;
    Ok(Json(content))
}

// ── PUT /api/files/write ────────────────────────────────────────────

pub async fn write_handler(
    Json(body): Json<FileWriteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    fs::write_file(&root, &body.path, &body.content)?;
    Ok(Json(json!({ "success": true })))
}

// ── GET /api/files/search?query=&regex=&case=&glob=&max= ────────────

pub async fn search_handler(
    Query(q): Query<SearchQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let response = search::search_files(&root, &q).await?;
    Ok(Json(response))
}

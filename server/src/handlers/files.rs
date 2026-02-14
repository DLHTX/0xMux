use axum::{
    Json,
    body::Body,
    extract::Query,
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;

use crate::error::AppError;
use crate::models::files::{
    FileCreateRequest, FileDeleteRequest, FileRevealRequest, FileRenameRequest,
    FileWriteRequest, SearchQuery,
};
use crate::services::{fs, git, search, workspace};

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
    let mut children = fs::list_directory(&root, path)?;

    // Mark gitignored files/directories
    if let Some(repo_root) = git::resolve_repo_root(&root) {
        let paths: Vec<String> = children.iter().map(|c| c.path.clone()).collect();
        let ignored_set = git::check_ignored(&repo_root, &paths);
        for child in &mut children {
            if ignored_set.contains(&child.path) {
                child.ignored = Some(true);
            }
        }
    }

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
    let absolute = fs::validate_path(&root, &q.path)?;
    Ok(Json(json!({ "path": absolute.to_string_lossy().to_string() })))
}

// ── GET /api/files/resolve?path= ────────────────────────────────────
// Fuzzy path resolution: tries direct path first, then prepends top-level subdirectories.

pub async fn resolve_path_handler(
    Query(q): Query<AbsolutePathQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let resolved = fs::fuzzy_resolve_path(&root, &q.path)?;
    Ok(Json(json!({ "path": resolved })))
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

// ── GET /api/files/raw?path= ─────────────────────────────────────────

pub async fn raw_handler(
    Query(q): Query<ReadQuery>,
) -> Result<Response, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;
    let file_path = fs::validate_path(&root, &q.path)?;

    if !file_path.is_file() {
        return Err(AppError::NotFound(format!("Not a file: {}", q.path)));
    }

    let meta = std::fs::metadata(&file_path)
        .map_err(|e| AppError::Internal(format!("Cannot read metadata: {e}")))?;

    // 10 MB limit for raw files
    if meta.len() > 10 * 1024 * 1024 {
        return Err(AppError::PayloadTooLarge(format!(
            "File too large: {} bytes",
            meta.len()
        )));
    }

    let bytes = std::fs::read(&file_path)
        .map_err(|e| AppError::Internal(format!("Cannot read file: {e}")))?;

    let mime = crate::utils::mime::mime_from_path(&file_path);

    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime).unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=60"),
    );
    Ok(resp)
}

// ── DELETE /api/files/delete ───────────────────────────────────────

pub async fn delete_handler(
    Json(body): Json<FileDeleteRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    fs::delete_path(&root, &body.path)?;
    Ok(Json(json!({ "success": true })))
}

// ── POST /api/files/rename ────────────────────────────────────────

pub async fn rename_handler(
    Json(body): Json<FileRenameRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    let new_path = fs::rename_path(&root, &body.old_path, &body.new_name)?;
    Ok(Json(json!({ "success": true, "new_path": new_path })))
}

// ── POST /api/files/create ────────────────────────────────────────

pub async fn create_handler(
    Json(body): Json<FileCreateRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    if body.is_directory {
        fs::create_directory(&root, &body.path)?;
    } else {
        fs::create_file(&root, &body.path)?;
    }
    Ok(Json(json!({ "success": true })))
}

// ── POST /api/files/reveal ────────────────────────────────────────

pub async fn reveal_handler(
    Json(body): Json<FileRevealRequest>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(body.session.as_deref(), body.window)?;
    fs::reveal_in_file_manager(&root, &body.path)?;
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

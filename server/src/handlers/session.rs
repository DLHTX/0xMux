use axum::{
    Json,
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;

use crate::error::AppError;
use crate::models::session::{CreateSessionRequest, CwdResponse, DirEntry, ListDirsResponse, NextNameResponse, RenameSessionRequest};
use crate::services::tmux;

pub async fn list_sessions_handler() -> Result<impl IntoResponse, AppError> {
    let sessions = tmux::list_sessions()?;
    Ok(Json(sessions))
}

pub async fn create_session_handler(
    Json(body): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let session = tmux::new_session(&body.name, body.start_directory.as_deref())?;
    Ok((StatusCode::CREATED, Json(session)))
}

pub async fn delete_session_handler(
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    tmux::kill_session(&name)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn rename_session_handler(
    Path(name): Path<String>,
    Json(body): Json<RenameSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let session = tmux::rename_session(&name, &body.name)?;
    Ok(Json(session))
}

pub async fn cwd_handler() -> Result<impl IntoResponse, AppError> {
    let cwd = std::env::current_dir()
        .map_err(|e| AppError::Internal(format!("Failed to get cwd: {e}")))?;
    let path = cwd.to_string_lossy().to_string();
    let basename = cwd
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    Ok(Json(CwdResponse { path, basename }))
}

#[derive(Deserialize)]
pub struct NextNameQuery {
    pub dir: Option<String>,
}

pub async fn next_name_handler(
    Query(q): Query<NextNameQuery>,
) -> Result<impl IntoResponse, AppError> {
    let dir = match q.dir {
        Some(d) => d,
        None => {
            let cwd = std::env::current_dir()
                .map_err(|e| AppError::Internal(format!("Failed to get cwd: {e}")))?;
            cwd.to_string_lossy().to_string()
        }
    };
    let name = tmux::next_session_name(&dir)?;
    Ok(Json(NextNameResponse { name }))
}

#[derive(Deserialize)]
pub struct ListDirsQuery {
    pub path: Option<String>,
}

pub async fn list_dirs_handler(
    Query(q): Query<ListDirsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let base = match q.path {
        Some(p) => {
            // Expand ~ to home dir
            if p.starts_with('~') {
                let home = dirs::home_dir()
                    .ok_or_else(|| AppError::Internal("Cannot determine home directory".into()))?;
                let rest = p.strip_prefix("~/").unwrap_or(p.strip_prefix('~').unwrap_or(""));
                if rest.is_empty() {
                    home
                } else {
                    home.join(rest)
                }
            } else {
                std::path::PathBuf::from(&p)
            }
        }
        None => dirs::home_dir()
            .ok_or_else(|| AppError::Internal("Cannot determine home directory".into()))?,
    };

    let canonical = base.canonicalize().map_err(|e| {
        AppError::BadRequest(format!("Invalid path '{}': {e}", base.display()))
    })?;

    if !canonical.is_dir() {
        return Err(AppError::BadRequest(format!(
            "'{}' is not a directory",
            canonical.display()
        )));
    }

    let parent = canonical.parent().map(|p| p.to_string_lossy().to_string());

    let mut dirs = Vec::new();
    let entries = std::fs::read_dir(&canonical).map_err(|e| {
        AppError::Internal(format!("Failed to read directory: {e}"))
    })?;

    for entry in entries.flatten() {
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !ft.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden dirs
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        dirs.push(DirEntry { name, path });
    }
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(Json(ListDirsResponse {
        path: canonical.to_string_lossy().to_string(),
        parent,
        dirs,
    }))
}

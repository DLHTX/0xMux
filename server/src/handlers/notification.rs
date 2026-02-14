use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateNotificationRequest {
    pub title: String,
    pub message: String,
    pub image_url: Option<String>,
    pub category: Option<String>,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct ListResponse {
    pub notifications: Vec<crate::services::notification::Notification>,
    pub unread_count: usize,
}

pub async fn create_notification_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateNotificationRequest>,
) -> impl IntoResponse {
    let notification = state
        .notification_service
        .create(req.title, req.message, req.image_url, req.category)
        .await;

    // Broadcast to WebSocket clients
    let ws_msg = serde_json::json!({
        "type": "notification",
        "data": notification,
    });
    let _ = state.notification_tx.send(ws_msg.to_string());

    (StatusCode::CREATED, Json(notification))
}

pub async fn list_notifications_handler(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(50);
    let (notifications, unread_count) = state.notification_service.list(limit).await;
    Json(ListResponse {
        notifications,
        unread_count,
    })
}

pub async fn delete_notification_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.notification_service.delete(&id).await {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

pub async fn mark_read_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.notification_service.mark_read(&id).await {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

pub async fn mark_all_read_handler(
    State(state): State<AppState>,
) -> impl IntoResponse {
    state.notification_service.mark_all_read().await;
    StatusCode::NO_CONTENT
}

/// List all cached images from ~/.cache/0xmux/images/ (sorted by modification time, newest first)
pub async fn list_images_handler() -> impl IntoResponse {
    let image_dir = match home::home_dir() {
        Some(h) => h.join(".cache/0xmux/images"),
        None => return Ok(Json(serde_json::json!({ "images": [] }))),
    };

    let mut entries = Vec::new();
    if let Ok(mut dir) = tokio::fs::read_dir(&image_dir).await {
        while let Ok(Some(entry)) = dir.next_entry().await {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
                if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" | "ico") {
                    continue;
                }
                let mtime = entry.metadata().await
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                entries.push((name.to_string(), mtime));
            }
        }
    }

    // Sort by modification time ascending (oldest first = Image #1)
    entries.sort_by_key(|(_, mtime)| *mtime);

    let images: Vec<serde_json::Value> = entries
        .into_iter()
        .map(|(name, _)| {
            let full_path = image_dir.join(&name).to_string_lossy().to_string();
            serde_json::json!({
                "filename": name,
                "path": full_path,
                "url": format!("/api/images/{}", name),
            })
        })
        .collect();

    Ok::<_, StatusCode>(Json(serde_json::json!({ "images": images })))
}

/// Serve images from ~/.cache/0xmux/images/{filename}
pub async fn serve_image_handler(
    Path(filename): Path<String>,
) -> impl IntoResponse {
    // Prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(StatusCode::BAD_REQUEST);
    }

    let image_dir = home::home_dir()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .join(".cache/0xmux/images");

    let path = image_dir.join(&filename);

    // Verify the resolved path is still inside image_dir
    let canonical = path
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let canonical_dir = image_dir
        .canonicalize()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !canonical.starts_with(&canonical_dir) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let data = tokio::fs::read(&canonical)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    let content_type = crate::utils::mime::mime_from_extension(&ext);

    Ok((
        [(axum::http::header::CONTENT_TYPE, content_type)],
        data,
    ))
}

/// Delete an image from ~/.cache/0xmux/images/{filename}
pub async fn delete_image_handler(
    Path(filename): Path<String>,
) -> impl IntoResponse {
    // Prevent path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(StatusCode::BAD_REQUEST);
    }

    let image_dir = home::home_dir()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .join(".cache/0xmux/images");

    let path = image_dir.join(&filename);

    // Verify the resolved path is still inside image_dir
    let canonical = path
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let canonical_dir = image_dir
        .canonicalize()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !canonical.starts_with(&canonical_dir) {
        return Err(StatusCode::BAD_REQUEST);
    }

    tokio::fs::remove_file(&canonical)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(StatusCode::NO_CONTENT)
}


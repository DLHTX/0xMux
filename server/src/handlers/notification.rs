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

    let content_type = mime_from_filename(&filename);

    Ok((
        [(axum::http::header::CONTENT_TYPE, content_type)],
        data,
    ))
}

fn mime_from_filename(filename: &str) -> &'static str {
    match filename.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

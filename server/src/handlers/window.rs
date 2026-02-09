use axum::{
    Json,
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
};

use crate::error::AppError;
use crate::models::window::CreateWindowRequest;
use crate::services::tmux;

pub async fn list_windows_handler(
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let windows = tmux::list_windows(&name)?;
    Ok(Json(windows))
}

pub async fn create_window_handler(
    Path(name): Path<String>,
    Json(body): Json<CreateWindowRequest>,
) -> Result<impl IntoResponse, AppError> {
    let window = tmux::new_window(&name, body.window_name.as_deref())?;
    Ok((StatusCode::CREATED, Json(window)))
}

pub async fn delete_window_handler(
    Path((name, index)): Path<(String, u32)>,
) -> Result<impl IntoResponse, AppError> {
    tmux::kill_window(&name, index)?;
    Ok(StatusCode::NO_CONTENT)
}

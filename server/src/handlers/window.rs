use axum::{Json, extract::{Path, Query}, http::StatusCode, response::IntoResponse};

use crate::error::AppError;
use crate::models::window::{
    CaptureQuery, CaptureResponse, CreateWindowRequest, SendInputRequest, SplitPaneRequest,
};
use crate::services::tmux;

pub async fn list_windows_handler(Path(name): Path<String>) -> Result<impl IntoResponse, AppError> {
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

pub async fn select_window_handler(
    Path((name, index)): Path<(String, u32)>,
) -> Result<impl IntoResponse, AppError> {
    tmux::select_window(&name, index)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_window_handler(
    Path((name, index)): Path<(String, u32)>,
) -> Result<impl IntoResponse, AppError> {
    tmux::kill_window(&name, index)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn send_input_handler(
    Path((name, index)): Path<(String, u32)>,
    Json(body): Json<SendInputRequest>,
) -> Result<impl IntoResponse, AppError> {
    tmux::send_keys(&name, index, &body.data)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn capture_handler(
    Path((name, index)): Path<(String, u32)>,
    Query(query): Query<CaptureQuery>,
) -> Result<impl IntoResponse, AppError> {
    let output = tmux::capture_pane(&name, index, query.lines)?;
    Ok(Json(CaptureResponse { output }))
}

pub async fn window_info_handler(
    Path((name, index)): Path<(String, u32)>,
) -> Result<impl IntoResponse, AppError> {
    let info = tmux::window_info(&name, index)?;
    Ok(Json(info))
}

// ── Pane-level handlers ───────────────────────────────────────────────

pub async fn split_pane_handler(
    Path((name, index)): Path<(String, u32)>,
    Json(body): Json<SplitPaneRequest>,
) -> Result<impl IntoResponse, AppError> {
    let horizontal = body.direction == "horizontal";
    let pane = tmux::split_window(&name, index, horizontal)?;
    Ok((StatusCode::CREATED, Json(pane)))
}

pub async fn list_panes_handler(
    Path((name, index)): Path<(String, u32)>,
) -> Result<impl IntoResponse, AppError> {
    let panes = tmux::list_panes(&name, index)?;
    Ok(Json(panes))
}

pub async fn kill_pane_handler(
    Path((name, index, pane)): Path<(String, u32, u32)>,
) -> Result<impl IntoResponse, AppError> {
    tmux::kill_pane(&name, index, pane)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn pane_input_handler(
    Path((name, index, pane)): Path<(String, u32, u32)>,
    Json(body): Json<SendInputRequest>,
) -> Result<impl IntoResponse, AppError> {
    tmux::send_keys_to_pane(&name, index, pane, &body.data)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn pane_capture_handler(
    Path((name, index, pane)): Path<(String, u32, u32)>,
    Query(query): Query<CaptureQuery>,
) -> Result<impl IntoResponse, AppError> {
    let output = tmux::capture_pane_target(&name, index, pane, query.lines)?;
    Ok(Json(CaptureResponse { output }))
}

pub async fn pane_info_handler(
    Path((name, index, pane)): Path<(String, u32, u32)>,
) -> Result<impl IntoResponse, AppError> {
    let info = tmux::pane_info(&name, index, pane)?;
    Ok(Json(info))
}

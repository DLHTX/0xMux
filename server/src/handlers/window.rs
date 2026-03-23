use axum::{Json, extract::{Path, Query}, http::StatusCode, response::IntoResponse};
use serde::Deserialize;
use serde_json::json;

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

// ── Dev command runner ──────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DevRunRequest {
    pub session: String,
    pub command: String,
    pub window_name: Option<String>,
    pub port: Option<u16>,
}

pub async fn dev_run_handler(
    Json(body): Json<DevRunRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Kill process on port if configured
    if let Some(port) = body.port {
        let _ = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{port}")])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| {
                let pids = String::from_utf8_lossy(&o.stdout);
                for pid in pids.lines() {
                    let pid = pid.trim();
                    if !pid.is_empty() {
                        let _ = std::process::Command::new("kill")
                            .args(["-9", pid])
                            .status();
                    }
                }
            });
        // Brief pause to let the port release
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    // Create a new tmux window
    let window = tmux::new_window(&body.session, body.window_name.as_deref())?;

    // Send the command + Enter
    let target = format!("{}:{}", body.session, window.index);
    let status = tmux::tmux_cmd()
        .args(["send-keys", "-t", &target, &body.command, "Enter"])
        .status()
        .map_err(|e| AppError::Internal(format!("send-keys failed: {e}")))?;

    if !status.success() {
        return Err(AppError::Internal(format!(
            "tmux send-keys failed for '{target}'"
        )));
    }

    Ok(Json(json!({
        "ok": true,
        "session": body.session,
        "window_index": window.index,
        "window_name": window.name,
    })))
}

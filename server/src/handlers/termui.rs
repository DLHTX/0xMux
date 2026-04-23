use axum::{Json, extract::State, response::IntoResponse};
use serde::Deserialize;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct TermUIRenderRequest {
    pub html: String,
    /// Session name for action callback (optional — auto-detected from $TMUX_PANE)
    pub session: Option<String>,
    /// Window index for action callback
    pub window: Option<u32>,
}

/// POST /api/termui — renders HTML in a webview pane via WebSocket broadcast.
/// No auth required (localhost only, used by AI agents running inside 0xMux).
pub async fn render_handler(
    State(state): State<AppState>,
    Json(body): Json<TermUIRenderRequest>,
) -> Result<impl IntoResponse, AppError> {
    if body.html.is_empty() {
        return Err(AppError::BadRequest("html field is required".into()));
    }

    // Broadcast to all connected WebSocket clients
    let msg = serde_json::json!({
        "type": "termui_render",
        "html": body.html,
        "session": body.session,
        "window": body.window,
    });

    let _ = state.notification_tx.send(msg.to_string());

    Ok(Json(serde_json::json!({ "ok": true })))
}

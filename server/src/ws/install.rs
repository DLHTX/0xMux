use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use tokio::sync::broadcast;

use crate::error::AppError;
use crate::state::AppState;

pub async fn ws_install_handler(
    ws: WebSocketUpgrade,
    Path(task_id): Path<String>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let rx = state
        .install_manager
        .subscribe(&task_id)
        .await
        .ok_or_else(|| AppError::NotFound(format!("Install task '{task_id}' not found")))?;

    Ok(ws.on_upgrade(move |socket| handle_install_socket(socket, rx)))
}

async fn handle_install_socket(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<String>,
) {
    while let Ok(msg) = rx.recv().await {
        if socket.send(Message::Text(msg.into())).await.is_err() {
            break;
        }
    }
}

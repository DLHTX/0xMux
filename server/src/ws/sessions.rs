use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use tokio::sync::broadcast;

use crate::services::tmux;
use crate::state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.session_tx.subscribe();

    loop {
        tokio::select! {
            Ok(msg) = rx.recv() => {
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text)
                            && parsed.get("type").and_then(|t| t.as_str()) == Some("ping")
                        {
                            let pong = serde_json::json!({"type": "pong"});
                            let _ = socket.send(Message::Text(pong.to_string().into())).await;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}

pub fn spawn_session_watcher(tx: broadcast::Sender<String>) {
    tokio::spawn(async move {
        let mut last_sessions: Option<String> = None;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;

            if let Ok(sessions) = tmux::list_sessions() {
                let json = serde_json::to_string(&sessions).unwrap_or_default();
                if last_sessions.as_ref() != Some(&json) {
                    last_sessions = Some(json.clone());
                    let msg = serde_json::json!({
                        "type": "sessions_update",
                        "data": { "sessions": sessions }
                    });
                    let _ = tx.send(msg.to_string());
                }
            }
        }
    });
}

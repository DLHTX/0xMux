use axum::{
    Json,
    extract::{Query, State},
    response::IntoResponse,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
};
use chrono::Utc;
use futures::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Deserialize;
use std::io::Read;
use std::sync::Arc;

use crate::error::AppError;
use crate::models::pty::PtySession;
use crate::services::tmux;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct PtyQuery {
    pub session: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

pub async fn ws_pty_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<PtyQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let session_name = query.session.clone();

    // Validate session exists
    let sessions = tmux::list_sessions()?;
    if !sessions.iter().any(|s| s.name == session_name) {
        return Err(AppError::NotFound(format!(
            "Session '{session_name}' not found"
        )));
    }

    let cols = query.cols.unwrap_or(80);
    let rows = query.rows.unwrap_or(24);

    Ok(ws.on_upgrade(move |socket| {
        handle_pty_socket(socket, state, session_name, cols, rows)
    }))
}

async fn handle_pty_socket(
    socket: WebSocket,
    state: AppState,
    session_name: String,
    cols: u16,
    rows: u16,
) {
    // Respawn dead pane right before opening the PTY — minimises the window
    // between respawn and tmux attach.  Runs on a blocking thread because
    // ensure_pane_alive calls std::thread::sleep internally.
    let sn = session_name.clone();
    let alive = tokio::task::spawn_blocking(move || tmux::ensure_pane_alive(&sn)).await;
    match alive {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            tracing::error!("Cannot revive pane for '{session_name}': {e:?}");
            // Send error to client and close
            let (mut tx, _) = socket.split();
            let err_msg = serde_json::json!({"type": "error", "message": format!("{e:?}")});
            let _ = tx.send(Message::Text(err_msg.to_string().into())).await;
            return;
        }
        Err(e) => {
            tracing::error!("ensure_pane_alive task panicked: {e}");
            return;
        }
    }

    let pty_system = native_pty_system();

    let pty_size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = match pty_system.openpty(pty_size) {
        Ok(pair) => pair,
        Err(e) => {
            tracing::error!("Failed to open PTY: {e}");
            return;
        }
    };

    let mut cmd = CommandBuilder::new("tmux");
    cmd.arg("attach-session");
    cmd.arg("-t");
    cmd.arg(&session_name);
    // Use a clean environment — inherited shell-theme vars (e.g. Powerlevel10k's
    // _P9K_TTY) cause zsh to fail inside the PTY and exit immediately.
    cmd.env_clear();
    for key in &["HOME", "SHELL", "USER", "LOGNAME", "PATH", "TERM", "LANG", "LC_ALL", "TMPDIR", "XDG_RUNTIME_DIR"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    if std::env::var("TERM").is_err() {
        cmd.env("TERM", "xterm-256color");
    }

    let mut child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(e) => {
            tracing::error!("Failed to spawn tmux attach: {e}");
            return;
        }
    };

    // Drop the slave to avoid holding the PTY open
    drop(pair.slave);

    let child_pid = child.process_id().unwrap_or(0);
    let pty_id = uuid::Uuid::new_v4().to_string();

    // Register PTY session
    let pty_session = PtySession {
        id: pty_id.clone(),
        session_name: session_name.clone(),
        cols,
        rows,
        pid: child_pid,
        created_at: Utc::now(),
    };

    {
        let mut sessions = state.pty_sessions.write().await;
        sessions.insert(pty_id.clone(), pty_session);
    }

    let reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(e) => {
            tracing::error!("Failed to clone PTY reader: {e}");
            state.pty_sessions.write().await.remove(&pty_id);
            return;
        }
    };

    let writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(e) => {
            tracing::error!("Failed to take PTY writer: {e}");
            state.pty_sessions.write().await.remove(&pty_id);
            return;
        }
    };

    // Send master to a dedicated blocking thread for resize operations
    // since MasterPty is Send but not Sync
    let (resize_tx, resize_rx) = tokio::sync::mpsc::unbounded_channel::<(u16, u16)>();
    spawn_resize_handler(pair.master, resize_rx);

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Use a shared flag to coordinate shutdown
    let shutdown = Arc::new(tokio::sync::Notify::new());
    let shutdown_reader = shutdown.clone();
    let shutdown_writer = shutdown.clone();

    // Channel for ws_to_pty to send control messages (pong) back through ws_sender
    let (ctrl_tx, mut ctrl_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Channel for PTY reader thread to send data to ws_sender
    let (pty_data_tx, mut pty_data_rx) = tokio::sync::mpsc::unbounded_channel::<Option<Vec<u8>>>();

    // Dedicated blocking thread for PTY reading
    tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = pty_data_tx.send(None);
                    break;
                }
                Ok(n) => {
                    if pty_data_tx.send(Some(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
                Err(_) => {
                    let _ = pty_data_tx.send(None);
                    break;
                }
            }
        }
    });

    // Task: PTY stdout -> WebSocket Binary frames (also handles control messages)
    let pty_to_ws = tokio::spawn(async move {
        loop {
            tokio::select! {
                data = pty_data_rx.recv() => {
                    match data {
                        Some(Some(bytes)) => {
                            if ws_sender.send(Message::Binary(bytes.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(None) | None => {
                            // PTY closed / EOF
                            let exit_msg = serde_json::json!({
                                "type": "exit",
                                "code": 0
                            });
                            let _ = ws_sender
                                .send(Message::Text(exit_msg.to_string().into()))
                                .await;
                            break;
                        }
                    }
                }
                Some(msg) = ctrl_rx.recv() => {
                    if ws_sender.send(msg).await.is_err() {
                        break;
                    }
                }
                _ = shutdown_reader.notified() => {
                    break;
                }
            }
        }
        shutdown_reader.notify_waiters();
    });

    // Task: WebSocket -> PTY stdin / control messages
    let pty_id_for_writer = pty_id.clone();
    let state_for_writer = state.clone();
    let ws_to_pty = tokio::spawn(async move {
        let mut writer = writer;
        loop {
            tokio::select! {
                msg = ws_receiver.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            let data_vec = data.to_vec();
                            // Use spawn_blocking for the blocking write
                            let write_result = tokio::task::spawn_blocking(move || {
                                use std::io::Write;
                                let result = writer.write_all(&data_vec);
                                (writer, result)
                            }).await;
                            match write_result {
                                Ok((w, Ok(_))) => {
                                    writer = w;
                                }
                                Ok((_, Err(_))) => break,
                                Err(_) => break,
                            }
                        }
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                                match parsed.get("type").and_then(|t| t.as_str()) {
                                    Some("resize") => {
                                        let new_cols = parsed.get("cols")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(80) as u16;
                                        let new_rows = parsed.get("rows")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(24) as u16;

                                        // Send resize to dedicated handler
                                        if resize_tx.send((new_cols, new_rows)).is_ok() {
                                            // Update stored session info
                                            let mut sessions = state_for_writer.pty_sessions.write().await;
                                            if let Some(s) = sessions.get_mut(&pty_id_for_writer) {
                                                s.cols = new_cols;
                                                s.rows = new_rows;
                                            }
                                        }
                                    }
                                    Some("ping") => {
                                        let pong = serde_json::json!({"type": "pong"});
                                        let _ = ctrl_tx.send(Message::Text(pong.to_string().into()));
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
                _ = shutdown_writer.notified() => {
                    break;
                }
            }
        }
        shutdown_writer.notify_waiters();
    });

    // Wait for both tasks to complete
    let _ = tokio::join!(pty_to_ws, ws_to_pty);

    // Kill the child process (tmux attach-session) to prevent lingering
    // tmux clients that accumulate on every reconnection.
    child.kill().ok();
    child.wait().ok();

    // Cleanup: remove PTY session from state
    {
        let mut sessions = state.pty_sessions.write().await;
        sessions.remove(&pty_id);
    }

    tracing::debug!("PTY session {pty_id} for '{session_name}' closed");
}

/// Spawns a blocking thread that owns the MasterPty and handles resize requests.
fn spawn_resize_handler(
    master: Box<dyn MasterPty + Send>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<(u16, u16)>,
) {
    tokio::task::spawn_blocking(move || {
        while let Some((cols, rows)) = rx.blocking_recv() {
            let size = PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            };
            if let Err(e) = master.resize(size) {
                tracing::warn!("PTY resize failed: {e}");
            }
        }
    });
}

pub async fn list_pty_sessions_handler(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let sessions = state.pty_sessions.read().await;
    let list: Vec<PtySession> = sessions.values().cloned().collect();
    Json(list)
}

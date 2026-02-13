use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::{Arc, LazyLock, Mutex};
use tokio::sync::{Notify, mpsc};

use crate::services::tmux;
use crate::state::AppState;

// ── Global registry of active `_0xmux_*` grouped sessions ──
// Tracked so the periodic GC and shutdown handler know which sessions are
// legitimately in use vs orphaned.

static ACTIVE_GROUPS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

fn register_group(name: &str) {
    ACTIVE_GROUPS.lock().unwrap().insert(name.to_string());
}

fn deregister_group(name: &str) {
    ACTIVE_GROUPS.lock().unwrap().remove(name);
}

/// Return a snapshot of all currently-active group session names.
pub fn active_group_names() -> HashSet<String> {
    ACTIVE_GROUPS.lock().unwrap().clone()
}

// ── Minimal env vars for tmux sub-commands ──

fn clean_env_iter() -> impl Iterator<Item = (String, String)> {
    const KEYS: &[&str] = &[
        "HOME",
        "SHELL",
        "USER",
        "LOGNAME",
        "PATH",
        "TERM",
        "LANG",
        "LC_ALL",
        "TMPDIR",
        "XDG_RUNTIME_DIR",
    ];
    KEYS.iter()
        .filter_map(|k| std::env::var(k).ok().map(|v| (k.to_string(), v)))
}

// ── Wire protocol types ──

#[derive(Deserialize)]
struct ControlFrame {
    #[serde(rename = "type")]
    msg_type: String,
    ch: Option<u16>,
    session: Option<String>,
    window: Option<u32>,
    cols: Option<u16>,
    rows: Option<u16>,
    lines: Option<i32>,
}

/// Internal events flowing from background tasks back to the main loop.
enum MuxEvent {
    /// PTY produced output for a channel
    PtyOutput(u16, Vec<u8>),
    /// PTY process exited / reader hit EOF
    PtyClosed(u16),
    /// A new channel was successfully created
    ChannelReady(u16, PtyChannel),
    /// Channel creation failed
    ChannelError(u16, String),
}

// SAFETY: PtyChannel contains only Send types
// (mpsc senders, Box<dyn Child + Send>, String)
unsafe impl Send for MuxEvent {}

// ── Per-channel state ──

struct PtyChannel {
    group_session: String,
    /// Send PTY stdin data to the writer thread
    input_tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Send resize requests to the resize handler thread
    resize_tx: mpsc::UnboundedSender<(u16, u16)>,
    /// The tmux-attach child process
    child: Box<dyn portable_pty::Child + Send>,
}

/// The parts produced by blocking PTY setup, sent across the async boundary.
struct ChannelParts {
    group_session: String,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn std::io::Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

// ── WebSocket handler ──

pub async fn ws_mux_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_mux_socket(socket, state))
}

async fn handle_mux_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Outbound message channel (all tasks send here, one sender task writes to WS)
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();

    // Internal event channel (PTY output, channel lifecycle)
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<MuxEvent>();

    // Subscribe to session watcher broadcasts
    let mut session_rx = state.session_tx.subscribe();

    // Active channels
    let mut channels: HashMap<u16, PtyChannel> = HashMap::new();

    // Shutdown signal for the sender task
    let shutdown = Arc::new(Notify::new());
    let shutdown_sender = shutdown.clone();

    // ── Sender task: forward out_rx -> ws_sender ──
    let sender_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg) = out_rx.recv() => {
                    if ws_sender.send(msg).await.is_err() {
                        break;
                    }
                }
                _ = shutdown_sender.notified() => break,
                else => break,
            }
        }
    });

    // Send an initial sessions/windows snapshot to this client immediately.
    // broadcast::Receiver does not replay the last message, so without this
    // a freshly reloaded page can wait until the next poll tick/change event.
    if let Ok(sessions) = tmux::list_sessions() {
        let windows = tmux::list_all_windows().unwrap_or_default();
        let msg = serde_json::json!({
            "type": "sessions_update",
            "data": {
                "sessions": sessions,
                "windows": windows,
            }
        });
        let _ = out_tx.send(Message::Text(msg.to_string().into()));
    }

    // ── Main event loop ──
    loop {
        tokio::select! {
            // Internal events from background tasks
            Some(event) = event_rx.recv() => {
                match event {
                    MuxEvent::PtyOutput(ch, data) => {
                        // Prefix with channel ID (big-endian u16)
                        let mut frame = Vec::with_capacity(2 + data.len());
                        frame.push((ch >> 8) as u8);
                        frame.push((ch & 0xff) as u8);
                        frame.extend_from_slice(&data);
                        let _ = out_tx.send(Message::Binary(frame.into()));
                    }
                    MuxEvent::PtyClosed(ch) => {
                        if let Some(mut channel) = channels.remove(&ch) {
                            cleanup_channel(&mut channel);
                            let msg = serde_json::json!({"type":"closed","ch":ch,"code":0});
                            let _ = out_tx.send(Message::Text(msg.to_string().into()));
                        }
                    }
                    MuxEvent::ChannelReady(ch, channel) => {
                        let group_session = channel.group_session.clone();
                        channels.insert(ch, channel);
                        let msg = serde_json::json!({"type":"opened","ch":ch});
                        let _ = out_tx.send(Message::Text(msg.to_string().into()));
                        let out_tx = out_tx.clone();
                        tokio::task::spawn_blocking(move || {
                            if let Ok((history, position)) = read_group_scroll_state(&group_session) {
                                let msg = serde_json::json!({
                                    "type": "scroll_state",
                                    "ch": ch,
                                    "history": history,
                                    "position": position,
                                });
                                let _ = out_tx.send(Message::Text(msg.to_string().into()));
                            }
                        });
                    }
                    MuxEvent::ChannelError(ch, message) => {
                        let msg = serde_json::json!({"type":"error","ch":ch,"message":message});
                        let _ = out_tx.send(Message::Text(msg.to_string().into()));
                    }
                }
            }

            // Session watcher broadcasts (forward as-is, already JSON)
            Ok(msg) = session_rx.recv() => {
                let _ = out_tx.send(Message::Text(msg.into()));
            }

            // Incoming WebSocket messages from client
            msg = ws_receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_text_frame(
                            &text,
                            &mut channels,
                            &out_tx,
                            &event_tx,
                        ).await;
                    }
                    Some(Ok(Message::Binary(data))) => {
                        handle_binary_frame(&data, &channels);
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    // ── Cleanup on disconnect ──
    for (_, mut ch) in channels.drain() {
        cleanup_channel(&mut ch);
    }
    shutdown.notify_waiters();
    let _ = sender_task.await;

    tracing::debug!("MuxSocket connection closed");
}

// ── Control frame handling ──

async fn handle_text_frame(
    text: &str,
    channels: &mut HashMap<u16, PtyChannel>,
    out_tx: &mpsc::UnboundedSender<Message>,
    event_tx: &mpsc::UnboundedSender<MuxEvent>,
) {
    let frame: ControlFrame = match serde_json::from_str(text) {
        Ok(f) => f,
        Err(_) => return,
    };

    match frame.msg_type.as_str() {
        "ping" => {
            let pong = serde_json::json!({"type":"pong"});
            let _ = out_tx.send(Message::Text(pong.to_string().into()));
        }

        "open" => {
            let ch = match frame.ch {
                Some(ch) => ch,
                None => return,
            };
            let session = match frame.session {
                Some(ref s) => s.clone(),
                None => return,
            };
            let window = frame.window;
            let cols = frame.cols.unwrap_or(80);
            let rows = frame.rows.unwrap_or(24);

            // If channel ID already in use, close the old one first
            if let Some(mut old) = channels.remove(&ch) {
                cleanup_channel(&mut old);
            }

            // Spawn channel creation in background (involves blocking I/O)
            let event_tx = event_tx.clone();
            tokio::spawn(async move {
                match open_channel(ch, session, window, cols, rows, event_tx.clone()).await {
                    Ok(()) => {} // ChannelReady sent inside open_channel
                    Err(e) => {
                        let _ = event_tx.send(MuxEvent::ChannelError(ch, e));
                    }
                }
            });
        }

        "close" => {
            if let Some(ch) = frame.ch {
                if let Some(mut channel) = channels.remove(&ch) {
                    cleanup_channel(&mut channel);
                    let msg = serde_json::json!({"type":"closed","ch":ch,"code":0});
                    let _ = out_tx.send(Message::Text(msg.to_string().into()));
                }
            }
        }

        "resize" => {
            if let Some(ch) = frame.ch {
                if let Some(channel) = channels.get(&ch) {
                    let cols = frame.cols.unwrap_or(80);
                    let rows = frame.rows.unwrap_or(24);
                    let _ = channel.resize_tx.send((cols, rows));
                }
            }
        }

        "scroll" => {
            if let (Some(ch), Some(lines)) = (frame.ch, frame.lines) {
                if lines != 0 {
                    if let Some(channel) = channels.get(&ch) {
                        let group_session = channel.group_session.clone();
                        let out_tx = out_tx.clone();
                        tokio::task::spawn_blocking(move || {
                            if let Err(error) = scroll_group_history(&group_session, lines) {
                                tracing::debug!(
                                    "Failed to scroll tmux history for group '{}': {}",
                                    group_session,
                                    error
                                );
                                return;
                            }
                            if let Ok((history, position)) = read_group_scroll_state(&group_session)
                            {
                                let msg = serde_json::json!({
                                    "type": "scroll_state",
                                    "ch": ch,
                                    "history": history,
                                    "position": position,
                                });
                                let _ = out_tx.send(Message::Text(msg.to_string().into()));
                            }
                        });
                    }
                }
            }
        }

        _ => {}
    }
}

// ── Binary frame handling (PTY input) ──

fn handle_binary_frame(data: &[u8], channels: &HashMap<u16, PtyChannel>) {
    if data.len() < 2 {
        return;
    }

    let ch_id = ((data[0] as u16) << 8) | (data[1] as u16);
    let payload = &data[2..];

    if let Some(channel) = channels.get(&ch_id) {
        let _ = channel.input_tx.send(payload.to_vec());
    }
}

// ── Channel lifecycle ──

/// Create a new PTY channel: grouped tmux session + PTY + reader/writer threads.
/// Sends `ChannelReady` through `event_tx` on success.
async fn open_channel(
    ch_id: u16,
    session_name: String,
    window: Option<u32>,
    cols: u16,
    rows: u16,
    event_tx: mpsc::UnboundedSender<MuxEvent>,
) -> Result<(), String> {
    // Run all blocking PTY setup in a single spawn_blocking
    let parts =
        tokio::task::spawn_blocking(move || setup_pty_blocking(&session_name, window, cols, rows))
            .await
            .map_err(|e| format!("PTY setup task panicked: {e}"))??;

    // Create input channel for PTY writer
    let (input_tx, input_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    // Create resize channel
    let (resize_tx, resize_rx) = mpsc::unbounded_channel::<(u16, u16)>();

    // Spawn PTY reader thread: reads stdout -> sends MuxEvent::PtyOutput
    let reader = parts.reader;
    let event_tx_reader = event_tx.clone();
    tokio::task::spawn_blocking(move || {
        pty_reader_loop(ch_id, reader, event_tx_reader);
    });

    // Spawn PTY writer thread: receives input_rx -> writes to stdin
    let writer = parts.writer;
    tokio::task::spawn_blocking(move || {
        pty_writer_loop(writer, input_rx);
    });

    // Spawn resize handler: receives resize_rx -> resizes PTY master
    spawn_resize_handler(parts.master, resize_rx);

    let channel = PtyChannel {
        group_session: parts.group_session,
        input_tx,
        resize_tx,
        child: parts.child,
    };

    match event_tx.send(MuxEvent::ChannelReady(ch_id, channel)) {
        Ok(()) => Ok(()),
        Err(err) => {
            // Main loop is gone (WS disconnected) — recover and cleanup
            // the channel that nobody will ever drain.
            if let MuxEvent::ChannelReady(_, mut ch) = err.0 {
                cleanup_channel(&mut ch);
            }
            Err("Event channel closed".to_string())
        }
    }
}

/// Blocking: ensure pane alive, open PTY, create grouped session, spawn tmux attach.
fn setup_pty_blocking(
    session_name: &str,
    window: Option<u32>,
    cols: u16,
    rows: u16,
) -> Result<ChannelParts, String> {
    // 1. Ensure the target pane is alive (respawn if dead)
    let alive_target = if let Some(w) = window {
        format!("{}:{}", session_name, w)
    } else {
        session_name.to_string()
    };
    tmux::ensure_pane_alive(&alive_target).map_err(|e| format!("Cannot revive pane: {e:?}"))?;

    // 2. Open a PTY pair
    let pty_system = native_pty_system();
    let pty_size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system
        .openpty(pty_size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // 3. Create a grouped tmux session for independent window tracking
    let group_session = format!("_0xmux_{}", uuid::Uuid::new_v4().simple());

    let status = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args([
            "new-session",
            "-d",
            "-t",
            session_name,
            "-s",
            &group_session,
        ])
        .status()
        .map_err(|e| format!("Failed to create grouped session: {e}"))?;

    if !status.success() {
        return Err(format!(
            "tmux new-session (group) exited with {status} for '{session_name}'"
        ));
    }

    // Register in the global active set so GC won't kill it
    register_group(&group_session);

    // 3b. Hide tmux status bar — the web UI renders its own chrome
    let _ = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args(["set-option", "-t", &group_session, "status", "off"])
        .status();

    // Ensure wheel events can drive tmux history inside attached clients.
    let _ = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args(["set-option", "-t", &group_session, "mouse", "on"])
        .status();

    let _ = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args([
            "set-option",
            "-t",
            &group_session,
            "history-limit",
            "200000",
        ])
        .status();

    // Web UI sends tmux commands through the default prefix key sequence.
    // Pin grouped sessions to C-b so scroll/copy commands work regardless of user dotfiles.
    let _ = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args(["set-option", "-t", &group_session, "prefix", "C-b"])
        .status();

    let _ = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args(["set-option", "-t", &group_session, "prefix2", "None"])
        .status();

    // 4. Select the target window inside the grouped session
    if let Some(window_index) = window {
        let select_target = format!("{}:{}", group_session, window_index);
        let _ = std::process::Command::new("tmux")
            .env_clear()
            .envs(clean_env_iter())
            .args(["select-window", "-t", &select_target])
            .status();
    }

    // 5. Spawn tmux attach-session inside the PTY
    let mut cmd = CommandBuilder::new("tmux");
    cmd.arg("attach-session");
    cmd.arg("-t");
    cmd.arg(&group_session);
    cmd.env_clear();
    for key in &[
        "HOME",
        "SHELL",
        "USER",
        "LOGNAME",
        "PATH",
        "TERM",
        "LANG",
        "LC_ALL",
        "TMPDIR",
        "XDG_RUNTIME_DIR",
    ] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    if std::env::var("TERM").is_err() {
        cmd.env("TERM", "xterm-256color");
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        // Clean up grouped session on failure
        deregister_group(&group_session);
        let _ = std::process::Command::new("tmux")
            .args(["kill-session", "-t", &group_session])
            .status();
        format!("Failed to spawn tmux attach: {e}")
    })?;

    // Drop slave so the PTY is only held by master
    drop(pair.slave);

    // 6. Get reader and writer from master
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    Ok(ChannelParts {
        group_session,
        reader,
        writer,
        master: pair.master,
        child,
    })
}

/// Blocking loop: read PTY stdout and send to the event channel.
fn pty_reader_loop(
    ch_id: u16,
    mut reader: Box<dyn Read + Send>,
    event_tx: mpsc::UnboundedSender<MuxEvent>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = event_tx.send(MuxEvent::PtyClosed(ch_id));
                break;
            }
            Ok(n) => {
                if event_tx
                    .send(MuxEvent::PtyOutput(ch_id, buf[..n].to_vec()))
                    .is_err()
                {
                    break; // main loop gone
                }
            }
            Err(_) => {
                let _ = event_tx.send(MuxEvent::PtyClosed(ch_id));
                break;
            }
        }
    }
}

/// Blocking loop: receive data from input channel and write to PTY stdin.
fn pty_writer_loop(
    mut writer: Box<dyn std::io::Write + Send>,
    mut input_rx: mpsc::UnboundedReceiver<Vec<u8>>,
) {
    use std::io::Write;
    while let Some(data) = input_rx.blocking_recv() {
        if writer.write_all(&data).is_err() {
            break;
        }
    }
}

/// Spawn a blocking thread that owns the MasterPty and handles resize requests.
fn spawn_resize_handler(
    master: Box<dyn MasterPty + Send>,
    mut rx: mpsc::UnboundedReceiver<(u16, u16)>,
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

fn scroll_group_history(group_session: &str, lines: i32) -> Result<(), String> {
    let amount = lines.unsigned_abs().min(200_000);
    if amount == 0 {
        return Ok(());
    }
    let amount_str = amount.to_string();

    if lines < 0 {
        let _ = std::process::Command::new("tmux")
            .env_clear()
            .envs(clean_env_iter())
            .args(["copy-mode", "-e", "-t", group_session])
            .status();

        let status = std::process::Command::new("tmux")
            .env_clear()
            .envs(clean_env_iter())
            .args([
                "send-keys",
                "-t",
                group_session,
                "-X",
                "-N",
                &amount_str,
                "scroll-up",
            ])
            .status()
            .map_err(|e| format!("tmux send-keys scroll-up failed: {e}"))?;

        if !status.success() {
            return Err(format!("tmux send-keys scroll-up exited with {status}"));
        }
    } else {
        let status = std::process::Command::new("tmux")
            .env_clear()
            .envs(clean_env_iter())
            .args([
                "send-keys",
                "-t",
                group_session,
                "-X",
                "-N",
                &amount_str,
                "scroll-down",
            ])
            .status()
            .map_err(|e| format!("tmux send-keys scroll-down failed: {e}"))?;

        if !status.success() {
            return Err(format!("tmux send-keys scroll-down exited with {status}"));
        }
    }

    Ok(())
}

fn read_group_scroll_state(group_session: &str) -> Result<(u32, u32), String> {
    let output = std::process::Command::new("tmux")
        .env_clear()
        .envs(clean_env_iter())
        .args([
            "display-message",
            "-t",
            group_session,
            "-p",
            "#{history_size}|#{scroll_position}",
        ])
        .output()
        .map_err(|e| format!("tmux display-message scroll state failed: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "tmux display-message scroll state exited with {}",
            output.status
        ));
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let mut parts = raw.trim().split('|');
    let history = parts
        .next()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);
    let position = parts
        .next()
        .map(str::trim)
        .and_then(|v| {
            if v.is_empty() {
                Some(0)
            } else {
                v.parse::<u32>().ok()
            }
        })
        .unwrap_or(0);

    Ok((history, position.min(history)))
}

/// Clean up a single channel: kill child, kill grouped tmux session, deregister.
fn cleanup_channel(channel: &mut PtyChannel) {
    // Dropping input_tx and resize_tx will cause the writer/resize threads to exit
    // (their blocking_recv returns None)
    channel.child.kill().ok();
    channel.child.wait().ok();

    // Remove from global active set BEFORE killing tmux session
    deregister_group(&channel.group_session);

    let _ = std::process::Command::new("tmux")
        .args(["kill-session", "-t", &channel.group_session])
        .status();

    tracing::debug!("Cleaned up mux channel (group {})", channel.group_session);
}

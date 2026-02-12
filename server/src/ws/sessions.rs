use tokio::sync::broadcast;

use crate::services::tmux;
use super::mux;

pub fn spawn_session_watcher(tx: broadcast::Sender<String>) {
    tokio::spawn(async move {
        let mut last_snapshot: Option<String> = None;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;

            let sessions = match tmux::list_sessions() {
                Ok(s) => s,
                Err(_) => continue,
            };
            let all_windows = tmux::list_all_windows().unwrap_or_default();

            // Build a combined snapshot for change detection.
            // This detects both session-level AND window-level changes.
            let snapshot = serde_json::json!({
                "sessions": &sessions,
                "windows": &all_windows,
            });
            let json = snapshot.to_string();

            if last_snapshot.as_ref() != Some(&json) {
                last_snapshot = Some(json);
                let msg = serde_json::json!({
                    "type": "sessions_update",
                    "data": snapshot,
                });
                let _ = tx.send(msg.to_string());
            }
        }
    });
}

/// Periodically reap orphaned `_0xmux_*` grouped sessions that are not in the
/// active channel registry.  Runs every 30 seconds as a safety net for any
/// cleanup failures (server crash recovery is handled at startup).
pub fn spawn_group_gc() {
    tokio::spawn(async {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let active = mux::active_group_names();
            tmux::gc_orphaned_groups(&active);
        }
    });
}

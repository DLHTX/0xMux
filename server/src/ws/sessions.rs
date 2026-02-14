use tokio::sync::broadcast;

use super::mux;
use crate::services::tmux;

pub fn spawn_session_watcher(tx: broadcast::Sender<String>) {
    tokio::spawn(async move {
        let mut last_snapshot: Option<String> = None;
        let interval = std::time::Duration::from_secs(3);
        loop {
            if let Ok(sessions) = tmux::list_sessions() {
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

            tokio::time::sleep(interval).await;
        }
    });
}

/// Periodically reap orphaned grouped sessions owned by THIS instance that are
/// not in the active channel registry.  Runs every 30 seconds as a safety net
/// for cleanup failures (server crash recovery is handled at startup).
pub fn spawn_group_gc() {
    let prefix = mux::instance_prefix().to_string();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let active = mux::active_group_names();
            tmux::gc_orphaned_groups(&prefix, &active);
        }
    });
}

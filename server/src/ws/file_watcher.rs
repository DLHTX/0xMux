use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::broadcast;

/// Directories to ignore when watching for file changes.
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "__pycache__",
    ".next",
    "dist",
    "build",
    ".svelte-kit",
    ".nuxt",
    ".output",
    "vendor",
    ".venv",
    "venv",
];

/// Check if a path should be ignored.
fn should_ignore(path: &Path) -> bool {
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            let name_str = name.to_string_lossy();
            if IGNORED_DIRS.iter().any(|d| *d == name_str.as_ref()) {
                return true;
            }
        }
    }
    false
}

/// Spawn a file watcher for the given directory.
/// Sends JSON messages to the broadcast channel when files change.
///
/// The watcher is debounced (500ms) to avoid flooding the client with events
/// during bulk operations like `git checkout` or `npm install`.
pub fn spawn_file_watcher(
    root: PathBuf,
    tx: broadcast::Sender<String>,
) -> Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>> {
    let root_clone = root.clone();
    let (debouncer_tx, debouncer_rx) = std::sync::mpsc::channel();

    let mut debouncer = match new_debouncer(Duration::from_millis(500), debouncer_tx) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("Failed to create file watcher: {e}");
            return None;
        }
    };

    if let Err(e) = debouncer
        .watcher()
        .watch(&root, notify::RecursiveMode::Recursive)
    {
        tracing::warn!("Failed to watch directory {}: {e}", root.display());
        return None;
    }

    tracing::info!("File watcher started for {}", root.display());

    // Background thread to process debounced events
    std::thread::spawn(move || {
        loop {
            match debouncer_rx.recv() {
                Ok(Ok(events)) => {
                    let mut changed_paths = HashSet::new();

                    for event in events {
                        if event.kind != DebouncedEventKind::Any {
                            continue;
                        }

                        let path = &event.path;

                        // Skip ignored directories
                        if should_ignore(path) {
                            continue;
                        }

                        // Convert to relative path from workspace root
                        if let Ok(relative) = path.strip_prefix(&root_clone) {
                            let rel_str = relative.to_string_lossy().to_string();
                            if !rel_str.is_empty() {
                                changed_paths.insert(rel_str);
                            }
                        }
                    }

                    if changed_paths.is_empty() {
                        continue;
                    }

                    // Collect the parent directories that changed
                    let mut changed_dirs = HashSet::new();
                    for path_str in &changed_paths {
                        let p = Path::new(path_str);
                        // Add the parent directory (or root if top-level file)
                        if let Some(parent) = p.parent() {
                            let parent_str = parent.to_string_lossy().to_string();
                            if parent_str.is_empty() {
                                changed_dirs.insert(".".to_string());
                            } else {
                                changed_dirs.insert(parent_str);
                            }
                        } else {
                            changed_dirs.insert(".".to_string());
                        }
                    }

                    let paths_vec: Vec<String> = changed_paths.into_iter().collect();
                    let dirs_vec: Vec<String> = changed_dirs.into_iter().collect();

                    let msg = serde_json::json!({
                        "type": "file_change",
                        "data": {
                            "paths": paths_vec,
                            "dirs": dirs_vec,
                        }
                    });

                    let _ = tx.send(msg.to_string());
                }
                Ok(Err(e)) => {
                    tracing::warn!("File watcher error: {e}");
                }
                Err(_) => {
                    // Channel closed, watcher was dropped
                    tracing::debug!("File watcher channel closed");
                    break;
                }
            }
        }
    });

    Some(debouncer)
}

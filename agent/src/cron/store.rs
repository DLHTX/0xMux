use super::types::{CronJob, CronStorage};
use std::path::PathBuf;

/// Get the storage file path: ~/.config/0xmux/agent/cron-jobs.json
fn storage_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("0xmux");
    path.push("agent");
    path.push("cron-jobs.json");
    path
}

/// Load jobs from JSON file
pub fn load() -> Result<Vec<CronJob>, String> {
    let path = storage_path();

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

    let storage: CronStorage =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse cron storage: {e}"))?;

    Ok(storage.jobs)
}

/// Save jobs to JSON file with atomic write (write to tmp, rename)
pub fn save(jobs: &[CronJob]) -> Result<(), String> {
    let path = storage_path();

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }

    let storage = CronStorage {
        version: 1,
        jobs: jobs.to_vec(),
    };

    let content =
        serde_json::to_string_pretty(&storage).map_err(|e| format!("Failed to serialize: {e}"))?;

    // Atomic write: write to tmp file then rename
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("Failed to write {}: {e}", tmp_path.display()))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename {} -> {}: {e}", tmp_path.display(), path.display()))?;

    Ok(())
}

/// Add `dirs` dependency is needed — let's add it
/// Actually dirs is already available through the crate dependencies if we add it
/// For now, use home crate or environment variable fallback
mod dirs {
    use std::path::PathBuf;

    pub fn config_dir() -> Option<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            std::env::var("HOME")
                .ok()
                .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
        }
        #[cfg(target_os = "windows")]
        {
            std::env::var("APPDATA").ok().map(PathBuf::from)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            std::env::var("XDG_CONFIG_HOME")
                .ok()
                .map(PathBuf::from)
                .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".config")))
        }
    }
}

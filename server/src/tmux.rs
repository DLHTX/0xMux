use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TmuxSession {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

pub fn list_sessions() -> Vec<TmuxSession> {
    let output = Command::new("tmux")
        .args([
            "list-sessions",
            "-F",
            "#{session_name}|#{session_windows}|#{session_created}|#{session_attached}",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout
                .lines()
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    if parts.len() == 4 {
                        Some(TmuxSession {
                            name: parts[0].to_string(),
                            windows: parts[1].parse().unwrap_or(0),
                            created: parts[2].to_string(),
                            attached: parts[3] == "1",
                        })
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => vec![],
    }
}

pub fn kill_session(name: &str) -> bool {
    Command::new("tmux")
        .args(["kill-session", "-t", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn new_session(name: &str) -> bool {
    Command::new("tmux")
        .args(["new-session", "-d", "-s", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn rename_session(old: &str, new: &str) -> bool {
    Command::new("tmux")
        .args(["rename-session", "-t", old, new])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

use crate::error::AppError;
use crate::models::system::InstallTaskInfo;
use crate::services::system::detect_package_manager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{Mutex, broadcast};
use uuid::Uuid;

const ALLOWED_PACKAGES: &[&str] = &["tmux", "claude-code"];

fn get_install_command(package: &str) -> Result<(String, Vec<String>), AppError> {
    let pm = detect_package_manager().ok_or_else(|| {
        AppError::ServiceUnavailable("No supported package manager found on this system".to_string())
    })?;

    let (bin, args) = match (pm.as_str(), package) {
        ("brew", "tmux") => ("brew", vec!["install", "tmux"]),
        ("apt", "tmux") => ("sudo", vec!["apt", "install", "-y", "tmux"]),
        ("dnf", "tmux") => ("sudo", vec!["dnf", "install", "-y", "tmux"]),
        ("brew", "claude-code") | ("apt", "claude-code") | ("dnf", "claude-code") => {
            ("npm", vec!["install", "-g", "@anthropic-ai/claude-code"])
        }
        _ => {
            return Err(AppError::ServiceUnavailable(format!(
                "Don't know how to install '{package}' with '{pm}'"
            )));
        }
    };

    Ok((bin.to_string(), args.into_iter().map(String::from).collect()))
}

pub struct InstallManager {
    running: Mutex<Option<String>>,
    channels: Mutex<HashMap<String, broadcast::Sender<String>>>,
}

impl InstallManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            running: Mutex::new(None),
            channels: Mutex::new(HashMap::new()),
        })
    }

    pub async fn start_install(
        self: &Arc<Self>,
        package: &str,
    ) -> Result<InstallTaskInfo, AppError> {
        if !ALLOWED_PACKAGES.contains(&package) {
            return Err(AppError::BadRequest(format!(
                "Package '{}' is not in the allowed list",
                package
            )));
        }

        {
            let running = self.running.lock().await;
            if running.is_some() {
                return Err(AppError::Conflict(
                    "An installation task is already running".to_string(),
                ));
            }
        }

        let (bin, args) = get_install_command(package)?;
        let task_id = Uuid::new_v4().to_string()[..8].to_string();
        let (tx, _) = broadcast::channel::<String>(256);

        {
            let mut channels = self.channels.lock().await;
            channels.insert(task_id.clone(), tx.clone());
        }

        {
            let mut running = self.running.lock().await;
            *running = Some(task_id.clone());
        }

        let task_id_clone = task_id.clone();
        let package_name = package.to_string();
        let manager = Arc::clone(self);

        tokio::spawn(async move {
            let start = std::time::Instant::now();
            let result = run_install_process(&bin, &args, &tx).await;
            let duration_ms = start.elapsed().as_millis() as u64;

            let (success, exit_code) = match result {
                Ok(code) => (code == 0, code),
                Err(e) => {
                    let err_msg = serde_json::json!({
                        "type": "install_error",
                        "data": {
                            "message": e.to_string(),
                            "manual_command": format!("{} {}", bin, args.join(" "))
                        }
                    });
                    let _ = tx.send(err_msg.to_string());
                    (false, -1)
                }
            };

            let complete_msg = serde_json::json!({
                "type": "install_complete",
                "data": {
                    "success": success,
                    "exit_code": exit_code,
                    "duration_ms": duration_ms
                }
            });
            let _ = tx.send(complete_msg.to_string());

            {
                let mut running = manager.running.lock().await;
                *running = None;
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            {
                let mut channels = manager.channels.lock().await;
                channels.remove(&task_id_clone);
            }
        });

        Ok(InstallTaskInfo {
            ws_url: format!("/ws/install/{}", task_id),
            task_id,
            package: package_name,
            status: "running".to_string(),
        })
    }

    pub async fn subscribe(&self, task_id: &str) -> Option<broadcast::Receiver<String>> {
        let channels = self.channels.lock().await;
        channels.get(task_id).map(|tx| tx.subscribe())
    }
}

async fn run_install_process(
    bin: &str,
    args: &[String],
    tx: &broadcast::Sender<String>,
) -> Result<i32, String> {
    let mut child = tokio::process::Command::new(bin)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start process: {e}"))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let tx_out = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let msg = serde_json::json!({
                "type": "install_log",
                "data": { "line": line, "stream": "stdout" }
            });
            let _ = tx_out.send(msg.to_string());
        }
    });

    let tx_err = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let msg = serde_json::json!({
                "type": "install_log",
                "data": { "line": line, "stream": "stderr" }
            });
            let _ = tx_err.send(msg.to_string());
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Process wait failed: {e}"))?;

    let _ = tokio::join!(stdout_task, stderr_task);

    Ok(status.code().unwrap_or(-1))
}

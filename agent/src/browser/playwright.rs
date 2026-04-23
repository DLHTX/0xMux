use super::types::{BrowserSession, BrowserTab, PageElement, PageSnapshot};
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Manages a Playwright browser subprocess
pub struct PlaywrightBridge {
    process: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    response_rx: Arc<Mutex<tokio::sync::mpsc::UnboundedReceiver<String>>>,
    session: Arc<Mutex<BrowserSession>>,
}

impl PlaywrightBridge {
    /// Launch a new Playwright browser subprocess
    pub async fn launch() -> Result<Self, String> {
        // Check if npx/playwright is available
        let npx = which_npx()?;

        let mut child = Command::new(&npx)
            .args(["playwright", "run-server"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn Playwright: {e}"))?;

        let stdin = child.stdin.take().ok_or("No stdin")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;

        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

        // Spawn stdout reader
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });

        let session = BrowserSession {
            id: uuid::Uuid::new_v4().to_string(),
            tabs: Vec::new(),
        };

        Ok(Self {
            process: Arc::new(Mutex::new(Some(child))),
            stdin: Arc::new(Mutex::new(Some(stdin))),
            response_rx: Arc::new(Mutex::new(rx)),
            session: Arc::new(Mutex::new(session)),
        })
    }

    /// Navigate to a URL
    pub async fn navigate(&self, url: &str) -> Result<(), String> {
        self.send_command(&serde_json::json!({
            "action": "navigate",
            "url": url
        }))
        .await?;
        Ok(())
    }

    /// Take a page snapshot (accessibility tree)
    pub async fn snapshot(&self) -> Result<PageSnapshot, String> {
        let response = self
            .send_command(&serde_json::json!({
                "action": "snapshot"
            }))
            .await?;

        // Parse response into PageSnapshot
        let elements: Vec<PageElement> = response
            .get("elements")
            .and_then(|e| serde_json::from_value(e.clone()).ok())
            .unwrap_or_default();

        Ok(PageSnapshot {
            url: response
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            title: response
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            total_elements: elements.len() as u32,
            elements,
        })
    }

    /// Click an element by ref ID
    pub async fn click(&self, ref_id: &str) -> Result<(), String> {
        self.send_command(&serde_json::json!({
            "action": "click",
            "ref": ref_id
        }))
        .await?;
        Ok(())
    }

    /// Type text into the focused element
    pub async fn type_text(&self, ref_id: &str, text: &str) -> Result<(), String> {
        self.send_command(&serde_json::json!({
            "action": "type",
            "ref": ref_id,
            "text": text
        }))
        .await?;
        Ok(())
    }

    /// List browser tabs
    pub async fn tabs(&self) -> Result<Vec<BrowserTab>, String> {
        let response = self
            .send_command(&serde_json::json!({
                "action": "tabs"
            }))
            .await?;

        let tabs: Vec<BrowserTab> = response
            .get("tabs")
            .and_then(|t| serde_json::from_value(t.clone()).ok())
            .unwrap_or_default();

        Ok(tabs)
    }

    /// Get session info
    pub async fn session(&self) -> BrowserSession {
        self.session.lock().await.clone()
    }

    /// Check if the subprocess is alive
    pub async fn is_alive(&self) -> bool {
        if let Some(ref mut child) = *self.process.lock().await {
            child.try_wait().ok().flatten().is_none()
        } else {
            false
        }
    }

    /// Kill the subprocess
    pub async fn close(&self) {
        if let Some(ref mut child) = *self.process.lock().await {
            let _ = child.kill().await;
        }
    }

    async fn send_command(&self, cmd: &Value) -> Result<Value, String> {
        let json_line = serde_json::to_string(cmd).map_err(|e| format!("Serialize error: {e}"))?;

        {
            let mut stdin = self.stdin.lock().await;
            if let Some(ref mut writer) = *stdin {
                writer
                    .write_all(format!("{json_line}\n").as_bytes())
                    .await
                    .map_err(|e| format!("Write error: {e}"))?;
                writer
                    .flush()
                    .await
                    .map_err(|e| format!("Flush error: {e}"))?;
            } else {
                return Err("Playwright process not running".into());
            }
        }

        // Wait for response (with timeout)
        let mut rx = self.response_rx.lock().await;
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx.recv()).await {
            Ok(Some(line)) => {
                serde_json::from_str(&line).map_err(|e| format!("Parse response error: {e}"))
            }
            Ok(None) => Err("Playwright process closed".into()),
            Err(_) => Err("Playwright response timeout".into()),
        }
    }
}

fn which_npx() -> Result<String, String> {
    // Try common paths
    for cmd in &["npx", "/usr/local/bin/npx", "/opt/homebrew/bin/npx"] {
        if std::process::Command::new(cmd)
            .arg("--version")
            .output()
            .is_ok()
        {
            return Ok(cmd.to_string());
        }
    }
    Err("npx not found. Install Node.js to use browser automation.".into())
}

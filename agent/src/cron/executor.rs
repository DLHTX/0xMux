use super::types::{CronAction, JobResult, JobStatus};
use chrono::Utc;
use std::time::Instant;

/// Execute a cron action and return the result
pub async fn execute(action: &CronAction) -> JobResult {
    let start = Instant::now();
    let executed_at = Utc::now();

    let (status, output, error) = match action {
        CronAction::RunCommand { cmd, args, cwd } => {
            execute_command(cmd, args, cwd.as_deref()).await
        }
        CronAction::OpenApp { name } => execute_open_app(name),
        CronAction::OpenUrl { url } => execute_open_url(url),
        CronAction::Screenshot {
            monitor_id,
            save_path,
        } => execute_screenshot(*monitor_id, save_path.as_deref()),
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    JobResult {
        status,
        output,
        error,
        duration_ms,
        executed_at,
    }
}

async fn execute_command(
    cmd: &str,
    args: &[String],
    cwd: Option<&str>,
) -> (JobStatus, Option<String>, Option<String>) {
    match crate::desktop::command::run_command(cmd, args, Some(120), None, cwd).await {
        Ok(result) => {
            if result.exit_code == 0 {
                (JobStatus::Success, Some(result.stdout), None)
            } else {
                (
                    JobStatus::Failed,
                    Some(result.stdout),
                    Some(format!(
                        "Exit code: {}. {}",
                        result.exit_code, result.stderr
                    )),
                )
            }
        }
        Err(e) => {
            if e.contains("timed out") {
                (JobStatus::Timeout, None, Some(e))
            } else {
                (JobStatus::Failed, None, Some(e))
            }
        }
    }
}

fn execute_open_app(name: &str) -> (JobStatus, Option<String>, Option<String>) {
    match crate::desktop::window::launch_app(name) {
        Ok(pid) => (
            JobStatus::Success,
            Some(format!("Launched {name} (pid: {pid})")),
            None,
        ),
        Err(e) => (JobStatus::Failed, None, Some(e)),
    }
}

fn execute_open_url(url: &str) -> (JobStatus, Option<String>, Option<String>) {
    let result = std::process::Command::new("open").arg(url).output();

    match result {
        Ok(output) if output.status.success() => {
            (JobStatus::Success, Some(format!("Opened {url}")), None)
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            (JobStatus::Failed, None, Some(stderr))
        }
        Err(e) => (
            JobStatus::Failed,
            None,
            Some(format!("Failed to open URL: {e}")),
        ),
    }
}

fn execute_screenshot(
    monitor_id: Option<u32>,
    save_path: Option<&str>,
) -> (JobStatus, Option<String>, Option<String>) {
    match crate::desktop::screenshot::capture_monitor(
        monitor_id,
        crate::types::ImageFormat::Png,
        80,
        1.0,
    ) {
        Ok(screenshot) => {
            if let Some(path) = save_path {
                // Decode base64 and save to file
                use base64::Engine;
                match base64::engine::general_purpose::STANDARD.decode(&screenshot.image) {
                    Ok(data) => match std::fs::write(path, &data) {
                        Ok(_) => (
                            JobStatus::Success,
                            Some(format!("Screenshot saved to {path}")),
                            None,
                        ),
                        Err(e) => (JobStatus::Failed, None, Some(format!("Write failed: {e}"))),
                    },
                    Err(e) => (JobStatus::Failed, None, Some(format!("Decode failed: {e}"))),
                }
            } else {
                (
                    JobStatus::Success,
                    Some(format!(
                        "Screenshot captured: {}x{} (scale: {})",
                        screenshot.logical_width,
                        screenshot.logical_height,
                        screenshot.scale_factor
                    )),
                    None,
                )
            }
        }
        Err(e) => (JobStatus::Failed, None, Some(e)),
    }
}

use crate::types::CommandOutput;
use std::time::Instant;
use tokio::process::Command;

/// Maximum output size (200KB)
const MAX_OUTPUT_BYTES: usize = 200 * 1024;

/// Default timeout in seconds
const DEFAULT_TIMEOUT_SECS: u64 = 120;

/// Maximum timeout in seconds
const MAX_TIMEOUT_SECS: u64 = 600;

/// Dangerous environment variables to filter
const DANGEROUS_ENV_VARS: &[&str] = &[
    "NODE_OPTIONS",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "DYLD_FRAMEWORK_PATH",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "PYTHONSTARTUP",
    "PERL5OPT",
    "RUBYOPT",
];

/// Execute a command safely with timeout and output limits
pub async fn run_command(
    cmd: &str,
    args: &[String],
    timeout_secs: Option<u64>,
    env: Option<&std::collections::HashMap<String, String>>,
    cwd: Option<&str>,
) -> Result<CommandOutput, String> {
    let timeout = timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .min(MAX_TIMEOUT_SECS);

    let mut command = Command::new(cmd);
    command.args(args);

    // Set working directory if provided
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    // Filter dangerous env vars from inherited environment
    for var in DANGEROUS_ENV_VARS {
        command.env_remove(var);
    }

    // Add user-specified env vars (after filtering)
    if let Some(env_map) = env {
        for (k, v) in env_map {
            // Don't allow re-adding dangerous vars
            if !DANGEROUS_ENV_VARS.contains(&k.as_str()) {
                command.env(k, v);
            }
        }
    }

    command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let start = Instant::now();

    let result =
        tokio::time::timeout(std::time::Duration::from_secs(timeout), command.output()).await;

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => {
            let (stdout, stdout_truncated) = truncate_output(&output.stdout);
            let (stderr, stderr_truncated) = truncate_output(&output.stderr);

            Ok(CommandOutput {
                exit_code: output.status.code().unwrap_or(-1),
                stdout,
                stderr,
                duration_ms,
                truncated: stdout_truncated || stderr_truncated,
            })
        }
        Ok(Err(e)) => Err(format!("Command execution failed: {e}")),
        Err(_) => Err(format!("Command timed out after {timeout}s")),
    }
}

fn truncate_output(data: &[u8]) -> (String, bool) {
    let truncated = data.len() > MAX_OUTPUT_BYTES;
    let slice = if truncated {
        &data[..MAX_OUTPUT_BYTES]
    } else {
        data
    };
    let text = String::from_utf8_lossy(slice).to_string();
    (text, truncated)
}

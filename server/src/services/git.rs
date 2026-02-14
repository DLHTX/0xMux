use crate::error::AppError;
use crate::models::git::{
    GitBranchInfo, GitChangedFile, GitCommitResponse, GitDiffResponse, GitLogEntry,
    GitPushResponse, GitStatusResponse,
};
use crate::services::fs::detect_language;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Build a `Command` for git with safe environment.
fn git_cmd(repo_path: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_OPTIONAL_LOCKS", "0");
    cmd
}

/// Resolve git repository top-level directory for a given path.
/// Returns `None` when the path is outside a git repository.
pub fn resolve_repo_root(path: &Path) -> Option<PathBuf> {
    let output = git_cmd(path)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if root.is_empty() {
        None
    } else {
        Some(PathBuf::from(root))
    }
}

/// Get git repository status.
pub fn get_status(repo_path: &Path) -> Result<GitStatusResponse, AppError> {
    let output = git_cmd(repo_path)
        .args(["status", "--porcelain=v2", "--branch"])
        .output()
        .map_err(|e| AppError::Internal(format!("git not found: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!(
            "Not a git repository or git error: {stderr}"
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_status(&stdout)
}

/// Parse `git status --porcelain=v2 --branch` output.
fn parse_status(output: &str) -> Result<GitStatusResponse, AppError> {
    let mut branch = String::from("HEAD");
    let mut upstream: Option<String> = None;
    let mut ahead = 0i32;
    let mut behind = 0i32;
    let mut files: Vec<GitChangedFile> = Vec::new();

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            branch = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            upstream = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // Format: +N -M
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 2 {
                ahead = parts[0].trim_start_matches('+').parse().unwrap_or(0);
                behind = parts[1].trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // Changed entries
            let parts: Vec<&str> = line.splitn(9, ' ').collect();
            if parts.len() >= 9 {
                let xy = parts[1];
                let path_str = parts[8];

                // X = index status, Y = worktree status
                let x = xy.chars().next().unwrap_or('.');
                let y = xy.chars().nth(1).unwrap_or('.');

                // Staged change (index)
                if x != '.' {
                    let (old_path, path) = if line.starts_with("2 ") {
                        // Rename: path contains "newpath\toldpath"
                        let tab_parts: Vec<&str> = path_str.splitn(2, '\t').collect();
                        if tab_parts.len() == 2 {
                            (Some(tab_parts[1].to_string()), tab_parts[0].to_string())
                        } else {
                            (None, path_str.to_string())
                        }
                    } else {
                        (None, path_str.to_string())
                    };

                    files.push(GitChangedFile {
                        path,
                        status: char_to_status(x),
                        staged: true,
                        old_path,
                    });
                }

                // Worktree change
                if y != '.' {
                    let path = if line.starts_with("2 ") {
                        path_str.splitn(2, '\t').next().unwrap_or(path_str)
                    } else {
                        path_str
                    };

                    files.push(GitChangedFile {
                        path: path.to_string(),
                        status: char_to_status(y),
                        staged: false,
                        old_path: None,
                    });
                }
            }
        } else if let Some(rest) = line.strip_prefix("? ") {
            // Untracked file
            files.push(GitChangedFile {
                path: rest.to_string(),
                status: "untracked".into(),
                staged: false,
                old_path: None,
            });
        }
    }

    Ok(GitStatusResponse {
        branch,
        upstream,
        ahead,
        behind,
        files,
    })
}

fn char_to_status(c: char) -> String {
    match c {
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
    .into()
}

/// Check which paths are ignored by .gitignore.
/// Returns a set of paths (relative to repo root) that are ignored.
pub fn check_ignored(repo_path: &Path, paths: &[String]) -> std::collections::HashSet<String> {
    use std::io::Write;
    let mut ignored = std::collections::HashSet::new();
    if paths.is_empty() {
        return ignored;
    }

    let mut child = match Command::new("git")
        .current_dir(repo_path)
        .args(["check-ignore", "--stdin"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return ignored,
    };

    if let Some(ref mut stdin) = child.stdin {
        for p in paths {
            let _ = writeln!(stdin, "{p}");
        }
    }
    // Close stdin so git can finish
    drop(child.stdin.take());

    if let Ok(output) = child.wait_with_output() {
        if output.status.success() || output.status.code() == Some(1) {
            // exit 0 = all ignored, exit 1 = some not ignored, both are valid
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if !line.is_empty() {
                    ignored.insert(line.to_string());
                }
            }
        }
    }

    ignored
}

/// Get diff content for Monaco DiffEditor.
/// Returns both HEAD and working tree versions of a file.
pub fn get_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<GitDiffResponse, AppError> {
    // Get HEAD version
    let head_ref = if staged {
        "HEAD" // Compare staged vs HEAD
    } else {
        "HEAD"
    };

    let original = git_cmd(repo_path)
        .args(["show", &format!("{head_ref}:{file_path}")])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();

    // Get current version
    let modified = if staged {
        // For staged files, get index version
        git_cmd(repo_path)
            .args(["show", &format!(":{file_path}")])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    } else {
        // For unstaged, read the working tree file
        let full_path = repo_path.join(file_path);
        std::fs::read_to_string(&full_path).unwrap_or_default()
    };

    let language = detect_language(Path::new(file_path));

    Ok(GitDiffResponse {
        file_path: file_path.to_string(),
        original,
        modified,
        language,
    })
}

/// Get recent commit log.
pub fn get_log(repo_path: &Path, limit: usize) -> Result<Vec<GitLogEntry>, AppError> {
    let limit_str = format!("-{limit}");
    let output = git_cmd(repo_path)
        .args([
            "log",
            &limit_str,
            "--format=%H%x00%an%x00%ae%x00%aI%x00%s%x00%D",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("git log failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git log error: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(6, '\0').collect();
        if parts.len() < 5 {
            continue;
        }

        let hash = parts[0].to_string();
        let short_hash = hash.chars().take(7).collect();
        let refs_str = if parts.len() > 5 && !parts[5].is_empty() {
            Some(parts[5].to_string())
        } else {
            None
        };

        entries.push(GitLogEntry {
            hash,
            short_hash,
            message: parts[3 + 1].to_string(), // index 4 = subject
            author: parts[1].to_string(),
            email: parts[2].to_string(),
            date: parts[3].to_string(),
            refs: refs_str,
        });
    }

    Ok(entries)
}

/// Get all local and remote branches.
pub fn get_branches(repo_path: &Path) -> Result<Vec<GitBranchInfo>, AppError> {
    let output = git_cmd(repo_path)
        .args([
            "branch",
            "-a",
            "--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)",
        ])
        .output()
        .map_err(|e| AppError::Internal(format!("git branch failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!(
            "git branch error: {stderr}"
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 4 {
            continue;
        }

        let name = parts[0].to_string();
        let is_remote = name.starts_with("origin/") || name.contains('/');
        let upstream = if parts[2].is_empty() {
            None
        } else {
            Some(parts[2].to_string())
        };

        branches.push(GitBranchInfo {
            name,
            short_hash: parts[1].to_string(),
            upstream,
            is_current: parts[3].trim() == "*",
            is_remote,
        });
    }

    Ok(branches)
}

/// Commit staged changes with the given message.
pub fn commit(repo_path: &Path, message: &str) -> Result<GitCommitResponse, AppError> {
    let output = git_cmd(repo_path)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| AppError::Internal(format!("git commit failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git commit error: {stderr}")));
    }

    // Get the hash of the newly created commit
    let hash_output = git_cmd(repo_path)
        .args(["rev-parse", "HEAD"])
        .output()
        .map_err(|e| AppError::Internal(format!("git rev-parse failed: {e}")))?;

    let hash = String::from_utf8_lossy(&hash_output.stdout).trim().to_string();
    let short_hash = hash.chars().take(7).collect();

    Ok(GitCommitResponse {
        hash,
        short_hash,
        message: message.to_string(),
    })
}

/// Push to the remote repository.
pub fn push(repo_path: &Path) -> Result<GitPushResponse, AppError> {
    let output = git_cmd(repo_path)
        .args(["push"])
        .output()
        .map_err(|e| AppError::Internal(format!("git push failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git push error: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    // git push writes progress to stderr
    let msg = if stdout.trim().is_empty() {
        stderr.trim().to_string()
    } else {
        stdout.trim().to_string()
    };

    Ok(GitPushResponse {
        success: true,
        message: if msg.is_empty() { "Push completed".into() } else { msg },
    })
}

/// Stage specific files (git add).
pub fn stage(repo_path: &Path, paths: &[String]) -> Result<(), AppError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut cmd = git_cmd(repo_path);
    cmd.arg("add").arg("--");
    for p in paths {
        cmd.arg(p);
    }
    let output = cmd
        .output()
        .map_err(|e| AppError::Internal(format!("git add failed: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git add error: {stderr}")));
    }
    Ok(())
}

/// Stage all changes (git add -A).
pub fn stage_all(repo_path: &Path) -> Result<(), AppError> {
    let output = git_cmd(repo_path)
        .args(["add", "-A"])
        .output()
        .map_err(|e| AppError::Internal(format!("git add -A failed: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git add error: {stderr}")));
    }
    Ok(())
}

/// Unstage specific files (git reset HEAD).
pub fn unstage(repo_path: &Path, paths: &[String]) -> Result<(), AppError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut cmd = git_cmd(repo_path);
    cmd.arg("reset").arg("HEAD").arg("--");
    for p in paths {
        cmd.arg(p);
    }
    let output = cmd
        .output()
        .map_err(|e| AppError::Internal(format!("git reset failed: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git reset error: {stderr}")));
    }
    Ok(())
}

/// Unstage all files (git reset HEAD).
pub fn unstage_all(repo_path: &Path) -> Result<(), AppError> {
    let output = git_cmd(repo_path)
        .args(["reset", "HEAD"])
        .output()
        .map_err(|e| AppError::Internal(format!("git reset failed: {e}")))?;
    // git reset exits 0 even when there's nothing to unstage, but stderr may have warnings
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::BadRequest(format!("git reset error: {stderr}")));
    }
    Ok(())
}

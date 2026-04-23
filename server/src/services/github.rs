use crate::models::github::{CurrentPrResponse, CurrentPrStatus};
use std::path::Path;
use std::process::Command;

#[derive(serde::Deserialize, Debug)]
struct GhPullRequest {
    number: u64,
    title: String,
    url: String,
    #[serde(rename = "isDraft")]
    is_draft: bool,
    #[serde(rename = "reviewDecision")]
    review_decision: Option<String>,
    state: String,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

fn git_cmd(repo_path: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd
}

fn gh_cmd(repo_path: &Path) -> Command {
    let mut cmd = Command::new("gh");
    cmd.current_dir(repo_path);
    cmd.env("GH_PAGER", "cat");
    cmd.env("GH_PROMPT_DISABLED", "1");
    cmd.env("GH_NO_UPDATE_NOTIFIER", "1");
    cmd
}

fn current_branch(repo_path: &Path) -> Result<String, String> {
    let output = git_cmd(repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("git branch lookup failed: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        Err("empty branch name".to_string())
    } else {
        Ok(branch)
    }
}

fn normalize_status(pr: &GhPullRequest) -> CurrentPrStatus {
    if pr.is_draft {
        return CurrentPrStatus::Draft;
    }

    match pr.review_decision.as_deref() {
        Some("APPROVED") => CurrentPrStatus::Approved,
        Some("CHANGES_REQUESTED") => CurrentPrStatus::ChangesRequested,
        Some("REVIEW_REQUIRED") => CurrentPrStatus::ReviewRequired,
        _ if pr.state == "OPEN" => CurrentPrStatus::ReviewRequired,
        _ => CurrentPrStatus::Open,
    }
}

pub fn current_pr(repo_path: &Path) -> CurrentPrResponse {
    let branch = match current_branch(repo_path) {
        Ok(branch) => branch,
        Err(message) => return CurrentPrResponse::Error { message },
    };

    let output = match gh_cmd(repo_path)
        .args([
            "pr",
            "list",
            "--head",
            &branch,
            "--state",
            "open",
            "--json",
            "number,title,url,isDraft,reviewDecision,state,updatedAt",
        ])
        .output()
    {
        Ok(output) => output,
        Err(err) => {
            return CurrentPrResponse::GhUnavailable {
                message: Some(format!("gh unavailable: {err}")),
            };
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            None
        } else {
            Some(stderr)
        };
        return CurrentPrResponse::GhUnavailable { message };
    }

    let mut prs: Vec<GhPullRequest> = match serde_json::from_slice(&output.stdout) {
        Ok(prs) => prs,
        Err(err) => {
            return CurrentPrResponse::Error {
                message: format!("failed to parse gh output: {err}"),
            };
        }
    };

    prs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let Some(pr) = prs.first() else {
        return CurrentPrResponse::NoPr;
    };

    CurrentPrResponse::Ready {
        number: pr.number,
        title: pr.title.clone(),
        url: pr.url.clone(),
        status: normalize_status(pr),
        extra_count: prs.len().saturating_sub(1),
    }
}

#[cfg(test)]
mod tests {
    use super::{GhPullRequest, normalize_status};
    use crate::models::github::CurrentPrStatus;

    fn sample_pr() -> GhPullRequest {
        GhPullRequest {
            number: 1,
            title: "Test".to_string(),
            url: "https://example.com".to_string(),
            is_draft: false,
            review_decision: None,
            state: "OPEN".to_string(),
            updated_at: Some("2026-04-23T00:00:00Z".to_string()),
        }
    }

    #[test]
    fn maps_draft_before_review_state() {
        let mut pr = sample_pr();
        pr.is_draft = true;
        pr.review_decision = Some("APPROVED".to_string());
        assert!(matches!(normalize_status(&pr), CurrentPrStatus::Draft));
    }

    #[test]
    fn maps_changes_requested_review_state() {
        let mut pr = sample_pr();
        pr.review_decision = Some("CHANGES_REQUESTED".to_string());
        assert!(matches!(
            normalize_status(&pr),
            CurrentPrStatus::ChangesRequested
        ));
    }

    #[test]
    fn maps_open_without_decision_to_review_required() {
        let pr = sample_pr();
        assert!(matches!(
            normalize_status(&pr),
            CurrentPrStatus::ReviewRequired
        ));
    }
}

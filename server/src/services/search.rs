use crate::error::AppError;
use crate::models::files::{SearchMatch, SearchQuery, SearchResponse, SearchResultGroup};
use std::collections::HashMap;
use std::path::Path;

/// Get git-tracked files relative to root. Returns None if not a git repo.
async fn git_tracked_files(root: &Path) -> Option<std::collections::HashSet<String>> {
    use tokio::process::Command;

    if !root.join(".git").exists() {
        return None;
    }

    let output = Command::new("git")
        .args(["ls-files"])
        .current_dir(root)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    Some(
        text.lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect(),
    )
}

/// Search files using ripgrep CLI. Falls back to basic search if rg is unavailable.
/// In a git repo, only git-tracked files are included in results.
pub async fn search_files(root: &Path, query: &SearchQuery) -> Result<SearchResponse, AppError> {
    if query.query.is_empty() {
        return Err(AppError::BadRequest("Search query cannot be empty".into()));
    }

    let tracked = git_tracked_files(root).await;

    let mut response = match search_with_rg(root, query).await {
        Ok(r) => r,
        Err(_) => search_fallback(root, query)?,
    };

    // Filter to git-tracked files only
    if let Some(ref tracked_set) = tracked {
        response
            .results
            .retain(|g| tracked_set.contains(&g.file_path));
        response.total_matches = response.results.iter().map(|g| g.matches.len()).sum();
        response.total_files = response.results.len();
    }

    Ok(response)
}

/// Search using `rg --json` for structured output.
async fn search_with_rg(root: &Path, query: &SearchQuery) -> Result<SearchResponse, AppError> {
    use tokio::process::Command;

    let mut cmd = Command::new("rg");
    cmd.arg("--json")
        .arg("--max-count")
        .arg(query.max.to_string())
        .arg("--max-filesize")
        .arg("5M");

    if !query.case {
        cmd.arg("--ignore-case");
    }

    if query.regex {
        // query is already regex
    } else {
        cmd.arg("--fixed-strings");
    }

    if let Some(ref glob) = query.glob {
        cmd.arg("--glob").arg(glob);
    }

    cmd.arg("--").arg(&query.query).current_dir(root);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("rg not found: {e}")))?;

    // rg exit code 1 = no matches (not an error)
    if !output.status.success() && output.status.code() != Some(1) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!("rg failed: {stderr}")));
    }

    parse_rg_json(&output.stdout, query.max)
}

/// Parse ripgrep JSON Lines output into structured search results.
fn parse_rg_json(stdout: &[u8], max: usize) -> Result<SearchResponse, AppError> {
    let text = String::from_utf8_lossy(stdout);
    let mut groups: HashMap<String, Vec<SearchMatch>> = HashMap::new();
    let mut total_matches = 0usize;

    for line in text.lines() {
        if total_matches >= max {
            break;
        }

        let val: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if val["type"].as_str() != Some("match") {
            continue;
        }

        let data = &val["data"];
        let file_path = data["path"]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let line_number = data["line_number"].as_u64().unwrap_or(0);
        let line_content = data["lines"]["text"]
            .as_str()
            .unwrap_or("")
            .trim_end()
            .to_string();

        // Extract submatch positions
        let submatches = data["submatches"].as_array();
        let (match_start, match_end) = submatches
            .and_then(|s| s.first())
            .map(|m| {
                (
                    m["start"].as_u64().unwrap_or(0) as usize,
                    m["end"].as_u64().unwrap_or(0) as usize,
                )
            })
            .unwrap_or((0, 0));

        groups
            .entry(file_path.clone())
            .or_default()
            .push(SearchMatch {
                file_path,
                line_number,
                line_content,
                match_start,
                match_end,
            });

        total_matches += 1;
    }

    let truncated = total_matches >= max;
    let total_files = groups.len();

    let mut results: Vec<SearchResultGroup> = groups
        .into_iter()
        .map(|(file_path, matches)| SearchResultGroup { file_path, matches })
        .collect();
    results.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    Ok(SearchResponse {
        results,
        total_files,
        total_matches,
        truncated,
    })
}

/// Fallback search using walkdir + string matching when rg is unavailable.
fn search_fallback(root: &Path, query: &SearchQuery) -> Result<SearchResponse, AppError> {
    use std::fs;

    let mut groups: HashMap<String, Vec<SearchMatch>> = HashMap::new();
    let mut total_matches = 0usize;
    let max = query.max;

    let pattern = if query.regex {
        regex::Regex::new(&query.query)
            .map_err(|e| AppError::BadRequest(format!("Invalid regex: {e}")))?
    } else if query.case {
        regex::Regex::new(&regex::escape(&query.query))
            .map_err(|e| AppError::Internal(format!("Regex error: {e}")))?
    } else {
        regex::RegexBuilder::new(&regex::escape(&query.query))
            .case_insensitive(true)
            .build()
            .map_err(|e| AppError::Internal(format!("Regex error: {e}")))?
    };

    fn walk(
        dir: &Path,
        root: &Path,
        pattern: &regex::Regex,
        groups: &mut HashMap<String, Vec<SearchMatch>>,
        total: &mut usize,
        max: usize,
    ) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            if *total >= max {
                return;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();

            // Skip hidden dirs and common large dirs
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == ".git"
            {
                continue;
            }

            if path.is_dir() {
                walk(&path, root, pattern, groups, total, max);
            } else if path.is_file() {
                // Skip large files
                if let Ok(meta) = path.metadata() {
                    if meta.len() > 1_048_576 {
                        continue;
                    }
                }
                if let Ok(content) = fs::read_to_string(&path) {
                    let rel = path
                        .strip_prefix(root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/");

                    for (line_idx, line) in content.lines().enumerate() {
                        if *total >= max {
                            return;
                        }
                        if let Some(m) = pattern.find(line) {
                            groups
                                .entry(rel.clone())
                                .or_default()
                                .push(SearchMatch {
                                    file_path: rel.clone(),
                                    line_number: (line_idx + 1) as u64,
                                    line_content: line.to_string(),
                                    match_start: m.start(),
                                    match_end: m.end(),
                                });
                            *total += 1;
                        }
                    }
                }
            }
        }
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|e| AppError::Internal(format!("Cannot resolve root: {e}")))?;
    walk(
        &canonical_root,
        &canonical_root,
        &pattern,
        &mut groups,
        &mut total_matches,
        max,
    );

    let truncated = total_matches >= max;
    let total_files = groups.len();

    let mut results: Vec<SearchResultGroup> = groups
        .into_iter()
        .map(|(file_path, matches)| SearchResultGroup { file_path, matches })
        .collect();
    results.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    Ok(SearchResponse {
        results,
        total_files,
        total_matches,
        truncated,
    })
}

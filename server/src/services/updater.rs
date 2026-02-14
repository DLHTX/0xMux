use std::process::Command;

const GITHUB_REPO: &str = "DLHTX/0xMux";

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn current_platform() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "darwin-arm64";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "darwin-x64";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x64";
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
    )))]
    return "unknown";
}

fn parse_version(v: &str) -> Option<(u32, u32, u32)> {
    let v = v.strip_prefix('v').unwrap_or(v);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => false,
    }
}

/// Check GitHub releases API for the latest version.
/// Returns (version, download_url) if a release with matching platform asset exists.
pub fn check_latest_release() -> Option<(String, String)> {
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let output = Command::new("curl")
        .args([
            "-sL",
            "--max-time",
            "15",
            "-H",
            "Accept: application/vnd.github.v3+json",
            "-H",
            "User-Agent: 0xMux-Updater",
            &url,
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let body = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;

    let tag = json["tag_name"].as_str()?;
    let version = tag.strip_prefix('v').unwrap_or(tag).to_string();

    let platform = current_platform();
    let asset_name = format!("0xmux-{platform}.tar.gz");

    let download_url = json["assets"]
        .as_array()?
        .iter()
        .find(|a| a["name"].as_str() == Some(&asset_name))?["browser_download_url"]
        .as_str()?
        .to_string();

    Some((version, download_url))
}

/// Download tarball, extract binary, replace current exe.
pub fn perform_update(download_url: &str) -> Result<(), String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("Cannot determine current exe: {e}"))?;

    let tmp_dir = std::env::temp_dir().join(format!("0xmux-update-{}", std::process::id()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("Cannot create temp dir: {e}"))?;

    let tarball = tmp_dir.join("update.tar.gz");

    // Download
    tracing::info!("Downloading update from GitHub Releases...");
    let status = Command::new("curl")
        .args(["-sL", "--max-time", "120", "-o"])
        .arg(&tarball)
        .arg(download_url)
        .status()
        .map_err(|e| format!("Download failed: {e}"))?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err("curl download failed".to_string());
    }

    // Extract
    let status = Command::new("tar")
        .arg("xzf")
        .arg(&tarball)
        .arg("-C")
        .arg(&tmp_dir)
        .status()
        .map_err(|e| format!("Extract failed: {e}"))?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err("tar extract failed".to_string());
    }

    let new_binary = tmp_dir.join("oxmux-server");
    if !new_binary.exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err("Extracted binary not found".to_string());
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&new_binary, std::fs::Permissions::from_mode(0o755));
    }

    // Replace: move current to .old, then move new to current
    let backup = current_exe.with_extension("old");
    let _ = std::fs::remove_file(&backup);
    std::fs::rename(&current_exe, &backup).map_err(|e| {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        format!("Cannot backup current binary: {e}")
    })?;

    if let Err(e) = std::fs::rename(&new_binary, &current_exe) {
        // Restore backup
        let _ = std::fs::rename(&backup, &current_exe);
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(format!("Cannot replace binary: {e}"));
    }

    // Cleanup
    let _ = std::fs::remove_file(&backup);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    Ok(())
}

/// Manual check: returns version comparison info for the handler.
pub fn check_update() -> serde_json::Value {
    let current = current_version().to_string();

    match check_latest_release() {
        Some((latest, _download_url)) => {
            let has_update = is_newer(&latest, &current);
            serde_json::json!({
                "current": current,
                "latest": latest,
                "has_update": has_update,
            })
        }
        None => {
            serde_json::json!({
                "current": current,
                "latest": null,
                "has_update": false,
            })
        }
    }
}

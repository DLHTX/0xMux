use crate::models::system::{DependencyInfo, SystemDepsResponse};
use std::process::Command;

pub fn detect_os() -> (String, String) {
    let os = std::env::consts::OS;
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => other,
    };
    (os.to_string(), arch.to_string())
}

pub fn detect_package_manager() -> Option<String> {
    for pm in &["brew", "apt", "dnf", "yum", "pacman"] {
        if which::which(pm).is_ok() {
            return Some(pm.to_string());
        }
    }
    None
}

fn check_dependency(name: &str) -> DependencyInfo {
    match name {
        "tmux" => {
            let version = get_version("tmux", &["-V"]);
            DependencyInfo {
                name: "tmux".to_string(),
                required: true,
                installed: version.is_some(),
                version,
                min_version: Some("2.6".to_string()),
            }
        }
        "claude-code" => {
            let installed = which::which("claude").is_ok();
            DependencyInfo {
                name: "claude-code".to_string(),
                required: false,
                installed,
                version: None,
                min_version: None,
            }
        }
        _ => DependencyInfo {
            name: name.to_string(),
            required: false,
            installed: false,
            version: None,
            min_version: None,
        },
    }
}

fn get_version(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd).args(args).output().ok().and_then(|out| {
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        text.split_whitespace()
            .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()))
            .map(|v| v.to_string())
    })
}

pub fn check_all_deps() -> SystemDepsResponse {
    let (os, arch) = detect_os();
    let package_manager = detect_package_manager();

    let dependencies = vec![check_dependency("tmux"), check_dependency("claude-code")];

    SystemDepsResponse {
        os,
        arch,
        package_manager,
        dependencies,
    }
}

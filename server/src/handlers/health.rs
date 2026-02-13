use axum::{Json, extract::State, response::IntoResponse};

use crate::state::AppState;

pub async fn health_handler() -> impl IntoResponse {
    let pty_count = crate::ws::mux::active_group_names().len();
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "pty_count": pty_count
    }))
}

/// Get RFC 1918 private LAN IPs by parsing `ifconfig` / `ip addr` output.
/// Excludes loopback and non-private addresses (e.g. 198.18.x.x from VPN/proxy).
fn get_local_ips() -> Vec<String> {
    let output = std::process::Command::new("ifconfig")
        .output()
        .or_else(|_| {
            std::process::Command::new("ip")
                .args(["-4", "addr", "show"])
                .output()
        });

    let stdout = match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return vec![],
    };

    let re = regex::Regex::new(r"inet (\d+\.\d+\.\d+\.\d+)").unwrap();
    re.captures_iter(&stdout)
        .filter_map(|cap| {
            let ip = cap[1].to_string();
            if ip.starts_with("127.") {
                return None;
            }
            let parts: Vec<u8> = ip.split('.').filter_map(|p| p.parse().ok()).collect();
            if parts.len() != 4 {
                return None;
            }
            // Only keep RFC 1918 private addresses
            let is_private = parts[0] == 10
                || (parts[0] == 172 && (16..=31).contains(&parts[1]))
                || (parts[0] == 192 && parts[1] == 168);
            if is_private { Some(ip) } else { None }
        })
        .collect()
}

pub async fn config_handler(State(state): State<AppState>) -> impl IntoResponse {
    let local_ips = get_local_ips();

    Json(serde_json::json!({
        "port": state.config.port,
        "host": state.config.host,
        "version": env!("CARGO_PKG_VERSION"),
        "local_ips": local_ips,
    }))
}

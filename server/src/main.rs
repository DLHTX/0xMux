use clap::Parser;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tracing_subscriber::EnvFilter;

mod banner;
mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod router;
mod services;
mod state;
#[cfg(feature = "embed-frontend")]
mod static_files;
mod ws;

use config::ServerConfig;
use services::auth_service::AuthService;
use services::config_store::PersistentConfig;
use services::install::InstallManager;
use state::AppState;
use ws::sessions::{spawn_group_gc, spawn_session_watcher};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("oxmux=debug".parse().unwrap()),
        )
        .init();

    // Clean up orphaned grouped sessions from previous server crashes
    services::tmux::cleanup_orphaned_groups();

    let config = ServerConfig::parse();
    let addr = config.addr();
    let banner_host = config.host.clone();
    let banner_port = config.port;

    let (session_tx, _) = broadcast::channel::<String>(64);
    spawn_session_watcher(session_tx.clone());
    spawn_group_gc();

    // 初始化认证服务
    let auth_service = Arc::new(AuthService::new());

    // 如果配置文件中已有密码，初始化HMAC密钥
    if let Ok(persistent_config) = PersistentConfig::load() {
        if let Some(password_hash) = &persistent_config.password_hash {
            auth_service.init_hmac_key(password_hash).await;
            tracing::info!("密码认证已启用");
        } else {
            tracing::warn!("首次启动，请在Web界面设置密码");
        }
    }

    let state = AppState {
        session_tx,
        config: Arc::new(config),
        install_manager: InstallManager::new(),
        pty_sessions: Arc::new(RwLock::new(HashMap::new())),
        auth_service,
    };

    let app = router::build(state);

    // Graceful shutdown: listen for SIGINT (Ctrl-C) and SIGTERM
    let shutdown = async {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{SignalKind, signal};
            let mut sigterm =
                signal(SignalKind::terminate()).expect("failed to register SIGTERM handler");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {},
                _ = sigterm.recv() => {},
            }
        }
        #[cfg(not(unix))]
        {
            tokio::signal::ctrl_c().await.ok();
        }
        tracing::info!("Shutdown signal received, draining connections…");
    };

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
            tracing::error!("Cannot start 0xMux: {addr} is already in use.");
            tracing::error!("Tip: stop the old process or change --port.");
            std::process::exit(1);
        }
        Err(err) => {
            tracing::error!("Cannot start 0xMux on {addr}: {err}");
            std::process::exit(1);
        }
    };
    banner::print_banner(&banner_host, banner_port);
    tracing::info!("0xMux server listening on {addr}");

    if let Err(err) = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await
    {
        tracing::error!("Server exited with error: {err}");
        std::process::exit(1);
    }

    // Final safety net: kill any remaining grouped sessions after all WS
    // connections have been drained.
    tracing::info!("Cleaning up remaining grouped sessions…");
    services::tmux::cleanup_orphaned_groups();
    tracing::info!("0xMux server stopped.");
}

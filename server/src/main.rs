use clap::Parser;
use std::sync::Arc;
use tokio::sync::broadcast;
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
mod utils;
mod ws;

use config::ServerConfig;
use services::auth_service::AuthService;
use services::config_store::PersistentConfig;
use services::install::InstallManager;
use services::notification::NotificationService;
use state::AppState;
use ws::sessions::{spawn_group_gc, spawn_session_watcher};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("oxmux=debug".parse().unwrap()),
        )
        .init();

    // Clean up orphaned grouped sessions from previous crashes — but only if
    // no other oxmux-server process is running.  When multiple instances share
    // the same tmux socket (e.g. dev on :1235 + production on :1234), a global
    // wipe would kill the other instance's active grouped sessions.
    if !services::tmux::is_another_instance_running() {
        tracing::info!("No other oxmux-server instance detected, cleaning up all orphaned groups");
        services::tmux::cleanup_orphaned_groups("_0xmux_");
    } else {
        tracing::info!("Another oxmux-server instance is running, skipping global group cleanup");
    }

    let config = ServerConfig::parse();
    let addr = config.addr();
    let banner_host = config.host.clone();
    let banner_port = config.port;

    // Expose port so PTY sessions can call the TermUI API
    // SAFETY: called before any threads are spawned
    unsafe { std::env::set_var("OXMUX_PORT", banner_port.to_string()) };

    // Initialize tmux socket isolation (must be before any tmux calls)
    services::tmux::init_tmux_socket(config.tmux_socket.clone());
    if let Some(ref socket) = config.tmux_socket {
        tracing::info!("Using tmux socket: {socket}");
    }

    let (session_tx, _) = broadcast::channel::<String>(64);
    let (notification_tx, _) = broadcast::channel::<String>(64);
    let (file_change_tx, _) = broadcast::channel::<String>(128);
    spawn_session_watcher(session_tx.clone());
    spawn_group_gc();

    // Start file watcher for the server's working directory
    let _file_watcher = {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        ws::file_watcher::spawn_file_watcher(cwd, file_change_tx.clone())
    };

    // 初始化通知服务
    let notification_service = Arc::new(NotificationService::new());

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

    // Agent cron service (feature-gated)
    #[cfg(feature = "agent")]
    let cron_service = {
        let svc = oxmux_agent::cron::CronService::new();
        if let Err(e) = svc.start().await {
            tracing::warn!("Failed to start cron service: {e}");
        }
        Some(svc)
    };

    let state = AppState {
        session_tx,
        notification_tx,
        file_change_tx,
        config: Arc::new(config),
        install_manager: InstallManager::new(),
        auth_service,
        notification_service,
        #[cfg(feature = "agent")]
        cron_service,
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

    // Final safety net: kill remaining grouped sessions owned by THIS instance.
    tracing::info!("Cleaning up remaining grouped sessions…");
    services::tmux::cleanup_orphaned_groups(ws::mux::instance_prefix());
    tracing::info!("0xMux server stopped.");
}

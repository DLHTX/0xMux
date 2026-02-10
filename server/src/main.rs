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
use services::install::InstallManager;
use services::auth_service::AuthService;
use services::config_store::PersistentConfig;
use state::AppState;
use ws::sessions::spawn_session_watcher;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("oxmux=debug".parse().unwrap()),
        )
        .init();

    let config = ServerConfig::parse();
    let addr = config.addr();
    let banner_host = config.host.clone();
    let banner_port = config.port;

    let (session_tx, _) = broadcast::channel::<String>(64);
    spawn_session_watcher(session_tx.clone());

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

    banner::print_banner(&banner_host, banner_port);
    tracing::info!("0xMux server listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}

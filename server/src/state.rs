use crate::config::ServerConfig;
use crate::models::pty::PtySession;
use crate::services::auth_service::AuthService;
use crate::services::install::InstallManager;
use crate::services::notification::NotificationService;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

#[derive(Clone)]
pub struct AppState {
    pub session_tx: broadcast::Sender<String>,
    pub notification_tx: broadcast::Sender<String>,
    pub config: Arc<ServerConfig>,
    pub install_manager: Arc<InstallManager>,
    #[allow(dead_code)]
    pub pty_sessions: Arc<RwLock<HashMap<String, PtySession>>>,
    pub auth_service: Arc<AuthService>,
    pub notification_service: Arc<NotificationService>,
}

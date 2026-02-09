use crate::config::ServerConfig;
use crate::models::pty::PtySession;
use crate::services::install::InstallManager;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

#[derive(Clone)]
pub struct AppState {
    pub session_tx: broadcast::Sender<String>,
    pub config: Arc<ServerConfig>,
    pub install_manager: Arc<InstallManager>,
    pub pty_sessions: Arc<RwLock<HashMap<String, PtySession>>>,
}

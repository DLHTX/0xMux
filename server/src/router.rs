use axum::{
    Router,
    http::Method,
    routing::{delete, get, post},
};
use tower_http::cors::{Any, CorsLayer};

use crate::handlers;
use crate::state::AppState;
use crate::ws;

pub fn build(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT])
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(handlers::health::health_handler))
        .route("/api/config", get(handlers::health::config_handler))
        .route(
            "/api/sessions",
            get(handlers::session::list_sessions_handler)
                .post(handlers::session::create_session_handler),
        )
        .route(
            "/api/sessions/{name}",
            delete(handlers::session::delete_session_handler)
                .put(handlers::session::rename_session_handler),
        )
        .route("/api/cwd", get(handlers::session::cwd_handler))
        .route("/api/dirs", get(handlers::session::list_dirs_handler))
        .route("/api/sessions/next-name", get(handlers::session::next_name_handler))
        .route("/api/system/deps", get(handlers::system::system_deps_handler))
        .route("/api/system/install", post(handlers::system::system_install_handler))
        .route("/api/system/restart", post(handlers::system::system_restart_handler))
        .route(
            "/api/sessions/{name}/windows",
            get(handlers::window::list_windows_handler)
                .post(handlers::window::create_window_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}",
            delete(handlers::window::delete_window_handler),
        )
        .route("/api/pty/sessions", get(ws::pty::list_pty_sessions_handler))
        .route("/ws", get(ws::sessions::ws_handler))
        .route("/ws/install/{task_id}", get(ws::install::ws_install_handler))
        .route("/ws/pty", get(ws::pty::ws_pty_handler))
        .layer(cors)
        .with_state(state);

    #[cfg(feature = "embed-frontend")]
    let app = app.fallback(crate::static_files::serve_embedded);

    app
}

use axum::{
    Router,
    http::Method,
    middleware,
    routing::{delete, get, post, put},
};
use tower_http::cors::CorsLayer;

use crate::handlers;
use crate::middleware::auth::auth_middleware;
use crate::state::AppState;
use crate::ws;

pub fn build(state: AppState) -> Router {
    let cors = {
        // Dev mode: allow any origin so LAN access works with Vite dev server
        #[cfg(debug_assertions)]
        {
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT])
                .allow_headers(tower_http::cors::Any)
        }
        // Production: same-origin only (credentials allowed, no extra origins)
        #[cfg(not(debug_assertions))]
        {
            CorsLayer::new()
                .allow_origin(Vec::<axum::http::HeaderValue>::new())
                .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT])
                .allow_headers(vec![
                    axum::http::header::AUTHORIZATION,
                    axum::http::header::CONTENT_TYPE,
                ])
                .allow_credentials(true)
        }
    };

    let app = Router::new()
        // 认证端点（无需鉴权）
        .route("/api/auth/status", get(handlers::auth::status_handler))
        .route("/api/auth/setup", post(handlers::auth::setup_handler))
        .route("/api/auth/skip", post(handlers::auth::skip_setup_handler))
        .route("/api/auth/login", post(handlers::auth::login_handler))
        // 需要鉴权的认证端点
        .route(
            "/api/auth/password",
            put(handlers::auth::change_password_handler),
        )
        // 其他API端点
        .route("/api/health", get(handlers::health::health_handler))
        .route("/api/config", get(handlers::health::config_handler))
        .route(
            "/api/check-update",
            post(handlers::health::check_update_handler),
        )
        .route(
            "/api/do-update",
            post(handlers::health::do_update_handler),
        )
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
        .route(
            "/api/sessions/next-name",
            get(handlers::session::next_name_handler),
        )
        .route(
            "/api/system/deps",
            get(handlers::system::system_deps_handler),
        )
        .route(
            "/api/system/install",
            post(handlers::system::system_install_handler),
        )
        .route(
            "/api/system/restart",
            post(handlers::system::system_restart_handler),
        )
        .route("/api/ai/status", get(handlers::ai::ai_status_handler))
        .route("/api/ai/catalog", get(handlers::ai::ai_catalog_handler))
        .route("/api/ai/sync", post(handlers::ai::ai_sync_handler))
        .route(
            "/api/ai/uninstall",
            post(handlers::ai::ai_uninstall_handler),
        )
        .route(
            "/api/upload/image",
            post(handlers::upload::upload_image_handler),
        )
        .route(
            "/api/layouts",
            get(handlers::layout::get_layouts).put(handlers::layout::save_layouts),
        )
        // File system API
        .route("/api/files/tree", get(handlers::files::tree_handler))
        .route(
            "/api/files/absolute",
            get(handlers::files::absolute_path_handler),
        )
        .route("/api/files/read", get(handlers::files::read_handler))
        .route("/api/files/write", put(handlers::files::write_handler))
        .route("/api/files/search", get(handlers::files::search_handler))
        // Git API
        .route("/api/git/status", get(handlers::git::status_handler))
        .route("/api/git/diff", get(handlers::git::diff_handler))
        .route("/api/git/log", get(handlers::git::log_handler))
        .route("/api/git/branches", get(handlers::git::branches_handler))
        .route(
            "/api/sessions/{name}/windows",
            get(handlers::window::list_windows_handler)
                .post(handlers::window::create_window_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}",
            delete(handlers::window::delete_window_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/select",
            put(handlers::window::select_window_handler),
        )
        .route("/ws/mux", get(ws::mux::ws_mux_handler))
        .route(
            "/ws/install/{task_id}",
            get(ws::install::ws_install_handler),
        )
        // 添加鉴权中间件
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(cors)
        .with_state(state);

    #[cfg(feature = "embed-frontend")]
    let app = app.fallback(crate::static_files::serve_embedded);

    #[cfg(not(feature = "embed-frontend"))]
    let app = {
        use tower_http::services::{ServeDir, ServeFile};
        let serve = ServeDir::new("../web/dist").fallback(ServeFile::new("../web/dist/index.html"));
        app.fallback_service(serve)
    };

    app
}

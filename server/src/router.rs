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
            "/api/ai/global-config",
            get(handlers::ai::ai_global_config_handler)
                .put(handlers::ai::ai_save_global_config_handler),
        )
        .route(
            "/api/ai/global-config/sync",
            post(handlers::ai::ai_sync_global_config_handler),
        )
        .route(
            "/api/upload/image",
            post(handlers::upload::upload_image_handler),
        )
        .route(
            "/api/files/upload",
            post(handlers::upload::upload_file_handler),
        )
        // Notification API
        .route(
            "/api/notifications",
            get(handlers::notification::list_notifications_handler)
                .post(handlers::notification::create_notification_handler),
        )
        .route(
            "/api/notifications/read-all",
            put(handlers::notification::mark_all_read_handler),
        )
        .route(
            "/api/notifications/{id}",
            delete(handlers::notification::delete_notification_handler),
        )
        .route(
            "/api/notifications/{id}/read",
            put(handlers::notification::mark_read_handler),
        )
        // Image serving & management
        .route(
            "/api/images",
            get(handlers::notification::list_images_handler),
        )
        .route(
            "/api/images/{filename}",
            get(handlers::notification::serve_image_handler)
                .delete(handlers::notification::delete_image_handler),
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
        .route(
            "/api/files/resolve",
            get(handlers::files::resolve_path_handler),
        )
        .route("/api/files/read", get(handlers::files::read_handler))
        .route("/api/files/raw", get(handlers::files::raw_handler))
        .route("/api/files/write", put(handlers::files::write_handler))
        .route(
            "/api/files/delete",
            post(handlers::files::delete_handler),
        )
        .route(
            "/api/files/rename",
            post(handlers::files::rename_handler),
        )
        .route(
            "/api/files/create",
            post(handlers::files::create_handler),
        )
        .route(
            "/api/files/reveal",
            post(handlers::files::reveal_handler),
        )
        .route(
            "/api/files/open-in",
            post(handlers::files::open_in_app_handler),
        )
        .route("/api/files/search", get(handlers::files::search_handler))
        // Git API
        .route("/api/git/status", get(handlers::git::status_handler))
        .route("/api/git/diff", get(handlers::git::diff_handler))
        .route("/api/git/log", get(handlers::git::log_handler))
        .route("/api/git/branches", get(handlers::git::branches_handler))
        .route("/api/git/commit", post(handlers::git::commit_handler))
        .route("/api/git/push", post(handlers::git::push_handler))
        .route("/api/git/stage", post(handlers::git::stage_handler))
        .route("/api/git/unstage", post(handlers::git::unstage_handler))
        .route("/api/git/stage-all", post(handlers::git::stage_all_handler))
        .route("/api/git/unstage-all", post(handlers::git::unstage_all_handler))
        .route("/api/git/checkout", post(handlers::git::checkout_handler))
        .route("/api/git/discard", post(handlers::git::discard_handler))
        .route("/api/git/discard-all", post(handlers::git::discard_all_handler))
        .route("/api/git/worktrees", get(handlers::git::worktree_list_handler).post(handlers::git::worktree_create_handler).delete(handlers::git::worktree_remove_handler))
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
        .route(
            "/api/sessions/{name}/windows/{index}/input",
            post(handlers::window::send_input_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/capture",
            get(handlers::window::capture_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/info",
            get(handlers::window::window_info_handler),
        )
        // Pane API (split & per-pane operations)
        .route(
            "/api/sessions/{name}/windows/{index}/split",
            post(handlers::window::split_pane_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/panes",
            get(handlers::window::list_panes_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/panes/{pane}",
            delete(handlers::window::kill_pane_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/panes/{pane}/input",
            post(handlers::window::pane_input_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/panes/{pane}/capture",
            get(handlers::window::pane_capture_handler),
        )
        .route(
            "/api/sessions/{name}/windows/{index}/panes/{pane}/info",
            get(handlers::window::pane_info_handler),
        )
        .route("/ws/mux", get(ws::mux::ws_mux_handler))
        .route(
            "/ws/install/{task_id}",
            get(ws::install::ws_install_handler),
        )
        ;

    // Agent desktop automation API (feature-gated)
    #[cfg(feature = "agent")]
    let app = app
        .route(
            "/api/agent/desktop/screenshot",
            post(handlers::agent::screenshot_handler),
        )
        .route(
            "/api/agent/desktop/displays",
            get(handlers::agent::displays_handler),
        )
        .route(
            "/api/agent/desktop/click",
            post(handlers::agent::click_handler),
        )
        .route(
            "/api/agent/desktop/type",
            post(handlers::agent::type_text_handler),
        )
        .route(
            "/api/agent/desktop/key",
            post(handlers::agent::press_key_handler),
        )
        .route(
            "/api/agent/desktop/drag",
            post(handlers::agent::drag_handler),
        )
        .route(
            "/api/agent/desktop/windows",
            get(handlers::agent::list_windows_handler),
        )
        .route(
            "/api/agent/desktop/focus",
            post(handlers::agent::focus_window_handler),
        )
        .route(
            "/api/agent/desktop/launch",
            post(handlers::agent::launch_app_handler),
        )
        .route(
            "/api/agent/desktop/quit",
            post(handlers::agent::quit_app_handler),
        )
        .route(
            "/api/agent/desktop/app-status",
            post(handlers::agent::app_status_handler),
        )
        .route(
            "/api/agent/desktop/command",
            post(handlers::agent::run_command_handler),
        )
        .route(
            "/api/agent/desktop/ui-tree",
            get(handlers::agent::ui_tree_handler),
        )
        .route(
            "/api/agent/desktop/ui-find",
            get(handlers::agent::ui_find_handler),
        )
        .route(
            "/api/agent/desktop/click-ref",
            post(handlers::agent::click_or_ref_handler),
        )
        // Cron API
        .route(
            "/api/agent/cron",
            get(handlers::agent_cron::list_jobs_handler)
                .post(handlers::agent_cron::create_job_handler),
        )
        .route(
            "/api/agent/cron/{id}",
            get(handlers::agent_cron::get_job_handler)
                .put(handlers::agent_cron::update_job_handler)
                .delete(handlers::agent_cron::delete_job_handler),
        )
        .route(
            "/api/agent/cron/{id}/run",
            post(handlers::agent_cron::run_now_handler),
        )
        .route(
            "/api/agent/cron/{id}/toggle",
            put(handlers::agent_cron::toggle_job_handler),
        )
        // Browser automation API
        .route(
            "/api/agent/browser/navigate",
            post(handlers::agent_browser::navigate_handler),
        )
        .route(
            "/api/agent/browser/snapshot",
            get(handlers::agent_browser::snapshot_handler),
        )
        .route(
            "/api/agent/browser/click",
            post(handlers::agent_browser::browser_click_handler),
        )
        .route(
            "/api/agent/browser/type",
            post(handlers::agent_browser::browser_type_handler),
        )
        .route(
            "/api/agent/browser/tabs",
            get(handlers::agent_browser::tabs_handler),
        )
        .route(
            "/api/agent/browser/close",
            post(handlers::agent_browser::close_handler),
        );

    let app = app
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

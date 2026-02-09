use axum::{
    Json,
    extract::State,
    response::IntoResponse,
};

use crate::state::AppState;

pub async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

pub async fn config_handler(State(state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "port": state.config.port,
        "host": state.config.host,
        "version": env!("CARGO_PKG_VERSION")
    }))
}

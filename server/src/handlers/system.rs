use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};

use crate::error::AppError;
use crate::models::system::InstallRequest;
use crate::services;
use crate::state::AppState;

pub async fn system_deps_handler() -> impl IntoResponse {
    Json(services::system::check_all_deps())
}

pub async fn system_install_handler(
    State(state): State<AppState>,
    Json(body): Json<InstallRequest>,
) -> Result<impl IntoResponse, AppError> {
    let task = state.install_manager.start_install(&body.package).await?;
    Ok((StatusCode::ACCEPTED, Json(task)))
}

pub async fn system_restart_handler() -> impl IntoResponse {
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        std::process::exit(42);
    });
    (
        StatusCode::ACCEPTED,
        Json(serde_json::json!({"message": "Server will restart shortly"})),
    )
}

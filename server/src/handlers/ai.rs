use axum::{Json, response::IntoResponse};

use crate::error::AppError;
use crate::models::ai::{AiSyncRequest, AiUninstallRequest};
use crate::services;

pub async fn ai_status_handler() -> Result<impl IntoResponse, AppError> {
    Ok(Json(services::ai_sync::get_status()?))
}

pub async fn ai_catalog_handler() -> Result<impl IntoResponse, AppError> {
    Ok(Json(services::ai_sync::get_catalog()?))
}

pub async fn ai_sync_handler(
    Json(body): Json<AiSyncRequest>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(services::ai_sync::sync(body)?))
}

pub async fn ai_uninstall_handler(
    Json(body): Json<AiUninstallRequest>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(services::ai_sync::uninstall(body)?))
}

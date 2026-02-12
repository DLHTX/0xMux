use axum::{Json, response::IntoResponse, http::StatusCode};

use crate::services::config_store;

/// GET /api/layouts — return saved layout JSON
pub async fn get_layouts() -> impl IntoResponse {
    match config_store::load_layouts() {
        Ok(json) => {
            // Return the raw JSON string with correct content-type
            (
                StatusCode::OK,
                [("content-type", "application/json")],
                json,
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!("Failed to load layouts: {e}");
            (
                StatusCode::OK,
                [("content-type", "application/json")],
                "{}".to_string(),
            )
                .into_response()
        }
    }
}

/// PUT /api/layouts — save layout JSON to disk
pub async fn save_layouts(Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let json = serde_json::to_string(&body).unwrap_or_else(|_| "{}".to_string());

    match config_store::save_layouts(&json) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!("Failed to save layouts: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Failed to save layouts: {e}")})),
            )
                .into_response()
        }
    }
}

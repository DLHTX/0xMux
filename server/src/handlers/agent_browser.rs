use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::AppError;

#[derive(Serialize)]
struct BrowserResponse<T: Serialize> {
    success: bool,
    data: T,
}

fn ok_json<T: Serialize>(data: T) -> impl IntoResponse {
    Json(BrowserResponse {
        success: true,
        data,
    })
}

/// Global browser bridge instance (lazy-initialized on first use)
static BROWSER: std::sync::LazyLock<Arc<Mutex<Option<oxmux_agent::browser::PlaywrightBridge>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(None)));

async fn get_or_launch_browser() -> Result<(), AppError> {
    let mut bridge = BROWSER.lock().await;
    if bridge.is_none() {
        let b = oxmux_agent::browser::PlaywrightBridge::launch()
            .await
            .map_err(|e| AppError::ServiceUnavailable(e))?;
        *bridge = Some(b);
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct NavigateRequest {
    pub url: String,
}

#[derive(Deserialize)]
pub struct BrowserClickRequest {
    pub r#ref: String,
}

#[derive(Deserialize)]
pub struct BrowserTypeRequest {
    pub r#ref: String,
    pub text: String,
}

pub async fn navigate_handler(
    Json(body): Json<NavigateRequest>,
) -> Result<impl IntoResponse, AppError> {
    get_or_launch_browser().await?;

    let bridge = BROWSER.lock().await;
    let b = bridge.as_ref().unwrap();

    b.navigate(&body.url)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"navigated": true, "url": body.url})))
}

pub async fn snapshot_handler() -> Result<impl IntoResponse, AppError> {
    get_or_launch_browser().await?;

    let bridge = BROWSER.lock().await;
    let b = bridge.as_ref().unwrap();

    let snapshot = b.snapshot().await.map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(snapshot))
}

pub async fn browser_click_handler(
    Json(body): Json<BrowserClickRequest>,
) -> Result<impl IntoResponse, AppError> {
    get_or_launch_browser().await?;

    let bridge = BROWSER.lock().await;
    let b = bridge.as_ref().unwrap();

    b.click(&body.r#ref)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"clicked": true, "ref": body.r#ref})))
}

pub async fn browser_type_handler(
    Json(body): Json<BrowserTypeRequest>,
) -> Result<impl IntoResponse, AppError> {
    get_or_launch_browser().await?;

    let bridge = BROWSER.lock().await;
    let b = bridge.as_ref().unwrap();

    b.type_text(&body.r#ref, &body.text)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"typed": true})))
}

pub async fn tabs_handler() -> Result<impl IntoResponse, AppError> {
    get_or_launch_browser().await?;

    let bridge = BROWSER.lock().await;
    let b = bridge.as_ref().unwrap();

    let tabs = b.tabs().await.map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(tabs))
}

pub async fn close_handler() -> Result<impl IntoResponse, AppError> {
    let mut bridge = BROWSER.lock().await;
    if let Some(b) = bridge.as_ref() {
        b.close().await;
    }
    *bridge = None;

    Ok((StatusCode::OK, ok_json(json!({"closed": true}))))
}

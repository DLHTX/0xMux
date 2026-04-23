use axum::extract::Query;
use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Mutex;

use crate::error::AppError;

// --- Request types ---

#[derive(Deserialize)]
pub struct ScreenshotRequest {
    pub monitor_id: Option<u32>,
    pub window_title: Option<String>,
    pub format: Option<String>,
    pub quality: Option<u8>,
    pub scale: Option<f32>,
}

#[derive(Deserialize)]
pub struct ClickRequest {
    pub x: i32,
    pub y: i32,
    pub button: Option<String>,
}

#[derive(Deserialize)]
pub struct TypeTextRequest {
    pub text: String,
}

#[derive(Deserialize)]
pub struct PressKeyRequest {
    pub key: String,
}

#[derive(Deserialize)]
pub struct DragRequest {
    pub from_x: i32,
    pub from_y: i32,
    pub to_x: i32,
    pub to_y: i32,
}

#[derive(Deserialize)]
pub struct FocusWindowRequest {
    pub title: String,
}

#[derive(Deserialize)]
pub struct LaunchAppRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct QuitAppRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct AppStatusRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RunCommandRequest {
    pub cmd: String,
    pub args: Option<Vec<String>>,
    pub timeout: Option<u64>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub cwd: Option<String>,
}

// --- Response wrapper ---

#[derive(Serialize)]
struct AgentResponse<T: Serialize> {
    success: bool,
    data: T,
}

fn ok_json<T: Serialize>(data: T) -> impl IntoResponse {
    Json(AgentResponse {
        success: true,
        data,
    })
}

// --- Handlers ---

pub async fn screenshot_handler(
    Json(body): Json<ScreenshotRequest>,
) -> Result<impl IntoResponse, AppError> {
    let format = match body.format.as_deref() {
        Some("jpeg") | Some("jpg") => oxmux_agent::ImageFormat::Jpeg,
        _ => oxmux_agent::ImageFormat::Png,
    };
    let quality = body.quality.unwrap_or(80);
    let scale = body.scale.unwrap_or(1.0);

    let result = if let Some(title) = body.window_title {
        tokio::task::spawn_blocking(move || {
            oxmux_agent::desktop::screenshot::capture_window(&title, format, quality)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
    } else {
        let monitor_id = body.monitor_id;
        tokio::task::spawn_blocking(move || {
            oxmux_agent::desktop::screenshot::capture_monitor(monitor_id, format, quality, scale)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
    };

    result
        .map(|s| ok_json(s))
        .map_err(|e| AppError::Internal(e))
}

pub async fn displays_handler() -> Result<impl IntoResponse, AppError> {
    let result = tokio::task::spawn_blocking(oxmux_agent::desktop::display::list_displays)
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    result
        .map(|d| ok_json(d))
        .map_err(|e| AppError::Internal(e))
}

pub async fn click_handler(Json(body): Json<ClickRequest>) -> Result<impl IntoResponse, AppError> {
    let button = match body.button.as_deref() {
        Some("right") => oxmux_agent::MouseButton::Right,
        Some("middle") => oxmux_agent::MouseButton::Middle,
        _ => oxmux_agent::MouseButton::Left,
    };

    tokio::task::spawn_blocking(move || oxmux_agent::desktop::input::click(body.x, body.y, button))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"clicked": true})))
}

pub async fn type_text_handler(
    Json(body): Json<TypeTextRequest>,
) -> Result<impl IntoResponse, AppError> {
    tokio::task::spawn_blocking(move || oxmux_agent::desktop::input::type_text(&body.text))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"typed": true})))
}

pub async fn press_key_handler(
    Json(body): Json<PressKeyRequest>,
) -> Result<impl IntoResponse, AppError> {
    tokio::task::spawn_blocking(move || oxmux_agent::desktop::input::press_key(&body.key))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"pressed": true})))
}

pub async fn drag_handler(Json(body): Json<DragRequest>) -> Result<impl IntoResponse, AppError> {
    tokio::task::spawn_blocking(move || {
        oxmux_agent::desktop::input::drag(body.from_x, body.from_y, body.to_x, body.to_y)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
    .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"dragged": true})))
}

pub async fn list_windows_handler() -> Result<impl IntoResponse, AppError> {
    let result = tokio::task::spawn_blocking(oxmux_agent::desktop::window::list_windows)
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    result
        .map(|w| ok_json(w))
        .map_err(|e| AppError::Internal(e))
}

pub async fn focus_window_handler(
    Json(body): Json<FocusWindowRequest>,
) -> Result<impl IntoResponse, AppError> {
    tokio::task::spawn_blocking(move || oxmux_agent::desktop::window::focus_window(&body.title))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"focused": true})))
}

pub async fn launch_app_handler(
    Json(body): Json<LaunchAppRequest>,
) -> Result<impl IntoResponse, AppError> {
    let result =
        tokio::task::spawn_blocking(move || oxmux_agent::desktop::window::launch_app(&body.name))
            .await
            .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    result
        .map(|pid| (StatusCode::CREATED, ok_json(json!({"pid": pid}))))
        .map_err(|e| AppError::Internal(e))
}

pub async fn quit_app_handler(
    Json(body): Json<QuitAppRequest>,
) -> Result<impl IntoResponse, AppError> {
    tokio::task::spawn_blocking(move || oxmux_agent::desktop::window::quit_app(&body.name))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"quit": true})))
}

pub async fn app_status_handler(
    Json(body): Json<AppStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let name = body.name;
    let name_clone = name.clone();
    let result =
        tokio::task::spawn_blocking(move || oxmux_agent::desktop::window::is_running(&name_clone))
            .await
            .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    result
        .map(|running| ok_json(json!({"name": name, "running": running})))
        .map_err(|e| AppError::Internal(e))
}

pub async fn run_command_handler(
    Json(body): Json<RunCommandRequest>,
) -> Result<impl IntoResponse, AppError> {
    let args = body.args.unwrap_or_default();
    let result = oxmux_agent::desktop::command::run_command(
        &body.cmd,
        &args,
        body.timeout,
        body.env.as_ref(),
        body.cwd.as_deref(),
    )
    .await;

    result
        .map(|o| ok_json(o))
        .map_err(|e| AppError::Internal(e))
}

// --- UI Tree handlers ---

#[derive(Deserialize)]
pub struct UITreeQuery {
    pub window_title: Option<String>,
    pub filter: Option<String>,
    pub depth: Option<u32>,
    pub max_elements: Option<u32>,
}

#[derive(Deserialize)]
pub struct UIFindQuery {
    pub query: String,
    pub window_title: Option<String>,
}

#[derive(Deserialize)]
pub struct ClickByRefRequest {
    pub r#ref: Option<String>,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub button: Option<String>,
}

/// Thread-safe ref manager that persists across a single UI tree read + click cycle
static LAST_REF_MANAGER: std::sync::LazyLock<
    Mutex<oxmux_agent::desktop::ui_tree::ref_manager::RefManager>,
> = std::sync::LazyLock::new(|| {
    Mutex::new(oxmux_agent::desktop::ui_tree::ref_manager::RefManager::new())
});

pub async fn ui_tree_handler(
    Query(params): Query<UITreeQuery>,
) -> Result<impl IntoResponse, AppError> {
    let filter = match params.filter.as_deref() {
        Some("interactive") => oxmux_agent::desktop::ui_tree::UITreeFilter::Interactive,
        _ => oxmux_agent::desktop::ui_tree::UITreeFilter::All,
    };

    let options = oxmux_agent::desktop::ui_tree::UITreeOptions {
        window_title: params.window_title,
        filter,
        depth: params.depth.unwrap_or(10),
        max_elements: params.max_elements.unwrap_or(500),
    };

    let result =
        tokio::task::spawn_blocking(move || oxmux_agent::desktop::ui_tree::read_tree(&options))
            .await
            .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    match result {
        Ok(tree) => {
            // Update ref manager with new element bounds
            if let Ok(mut mgr) = LAST_REF_MANAGER.lock() {
                *mgr = oxmux_agent::desktop::ui_tree::ref_manager::RefManager::new();
                for elem in &tree.elements {
                    mgr.register(elem.ref_id.clone(), elem.bounds);
                }
            }
            Ok(ok_json(tree))
        }
        Err(e) => Err(AppError::Internal(e)),
    }
}

pub async fn ui_find_handler(
    Query(params): Query<UIFindQuery>,
) -> Result<impl IntoResponse, AppError> {
    let options = oxmux_agent::desktop::ui_tree::UITreeOptions {
        window_title: params.window_title,
        filter: oxmux_agent::desktop::ui_tree::UITreeFilter::All,
        depth: 10,
        max_elements: 500,
    };

    let query = params.query;
    let result = tokio::task::spawn_blocking(move || {
        oxmux_agent::desktop::ui_tree::find_elements(&query, &options)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    result
        .map(|elements| ok_json(elements))
        .map_err(|e| AppError::Internal(e))
}

/// Enhanced click handler that supports both coordinate and ref-based clicking
pub async fn click_or_ref_handler(
    Json(body): Json<ClickByRefRequest>,
) -> Result<impl IntoResponse, AppError> {
    let button = match body.button.as_deref() {
        Some("right") => oxmux_agent::MouseButton::Right,
        Some("middle") => oxmux_agent::MouseButton::Middle,
        _ => oxmux_agent::MouseButton::Left,
    };

    // If ref is provided, use click-by-ref
    if let Some(ref ref_id) = body.r#ref {
        let center = LAST_REF_MANAGER
            .lock()
            .map_err(|e| AppError::Internal(format!("Lock error: {e}")))?
            .get_element_center(ref_id)
            .ok_or_else(|| {
                AppError::BadRequest(format!(
                    "Unknown ref '{ref_id}'. Read UI tree first with GET /api/agent/desktop/ui-tree"
                ))
            })?;

        tokio::task::spawn_blocking(move || {
            oxmux_agent::desktop::input::click(center.x, center.y, button)
        })
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

        return Ok(ok_json(
            json!({"clicked": true, "ref": ref_id, "x": center.x, "y": center.y}),
        ));
    }

    // Otherwise use x/y coordinates
    let x = body
        .x
        .ok_or_else(|| AppError::BadRequest("Either 'ref' or 'x'+'y' must be provided".into()))?;
    let y = body
        .y
        .ok_or_else(|| AppError::BadRequest("Either 'ref' or 'x'+'y' must be provided".into()))?;

    tokio::task::spawn_blocking(move || oxmux_agent::desktop::input::click(x, y, button))
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(json!({"clicked": true, "x": x, "y": y})))
}

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

use crate::state::AppState;
use crate::services::config_store::PersistentConfig;

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

/// 鉴权中间件：检查请求是否携带有效token
pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, Response> {
    let path = request.uri().path();

    // 白名单端点（无需鉴权）
    if is_whitelisted(path) {
        return Ok(next.run(request).await);
    }

    // 如果跳过了密码设置，允许所有请求（无需token）
    if let Ok(config) = PersistentConfig::load() {
        if config.password_skipped {
            return Ok(next.run(request).await);
        }
    }

    // 提取token（按优先级）
    let token = extract_token(&request);

    let token = match token {
        Some(t) => t,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "未登录".to_string(),
                }),
            )
                .into_response());
        }
    };

    // 验证token
    if !state.auth_service.verify_token(&token).await {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "登录已过期，请重新登录".to_string(),
            }),
        )
            .into_response());
    }

    Ok(next.run(request).await)
}

/// 检查路径是否在白名单中
fn is_whitelisted(path: &str) -> bool {
    // 白名单端点
    const WHITELIST: &[&str] = &[
        "/api/health",
        "/api/auth/status",
        "/api/auth/setup",
        "/api/auth/skip",
        "/api/auth/login",
    ];

    // 精确匹配
    if WHITELIST.contains(&path) {
        return true;
    }

    // 静态文件（不以/api开头的都是静态文件）
    if !path.starts_with("/api") && !path.starts_with("/ws") {
        return true;
    }

    false
}

/// 从请求中提取token（按优先级：Bearer header > query param > cookie）
fn extract_token(request: &Request<Body>) -> Option<String> {
    // 1. Authorization: Bearer <token>
    if let Some(auth_header) = request.headers().get(header::AUTHORIZATION)
        && let Ok(auth_str) = auth_header.to_str()
        && let Some(token) = auth_str.strip_prefix("Bearer ")
    {
        return Some(token.to_string());
    }

    // 2. ?token=<token>
    if let Some(query) = request.uri().query() {
        for param in query.split('&') {
            if let Some(value) = param.strip_prefix("token=") {
                return Some(value.to_string());
            }
        }
    }

    // 3. Cookie: mux_token=<token>
    if let Some(cookie_header) = request.headers().get(header::COOKIE)
        && let Ok(cookie_str) = cookie_header.to_str()
    {
        for cookie in cookie_str.split(';') {
            let cookie = cookie.trim();
            if let Some(value) = cookie.strip_prefix("mux_token=") {
                return Some(value.to_string());
            }
        }
    }

    None
}

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;
use crate::services::auth_service::AuthService;
use crate::services::config_store::PersistentConfig;

#[derive(Deserialize)]
pub struct SetupRequest {
    pub password: String,
    pub confirm: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current: String,
    pub password: String,
    pub confirm: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub token: String,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub initialized: bool,
    pub authenticated: bool,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// POST /api/auth/setup - 首次设置密码
pub async fn setup_handler(
    State(state): State<AppState>,
    Json(req): Json<SetupRequest>,
) -> Result<Json<TokenResponse>, (StatusCode, Json<ErrorResponse>)> {
    // 检查是否已初始化
    let config = PersistentConfig::load().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("加载配置失败: {}", e),
            }),
        )
    })?;

    if config.is_initialized() {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "密码已设置".to_string(),
            }),
        ));
    }

    // 验证密码
    if req.password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "密码至少需要6个字符".to_string(),
            }),
        ));
    }

    if req.password != req.confirm {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "两次输入的密码不一致".to_string(),
            }),
        ));
    }

    // 哈希密码
    let password_hash = AuthService::hash_password(&req.password).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        )
    })?;

    // 保存配置
    let new_config = PersistentConfig {
        password_hash: Some(password_hash.clone()),
        ..config
    };

    new_config.save().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("保存配置失败: {}", e),
            }),
        )
    })?;

    // 初始化HMAC密钥
    state.auth_service.init_hmac_key(&password_hash).await;

    // 生成token
    let token = state.auth_service.generate_token().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        )
    })?;

    Ok(Json(TokenResponse { token }))
}

/// POST /api/auth/login - 登录验证
pub async fn login_handler(
    State(state): State<AppState>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenResponse>, (StatusCode, Json<ErrorResponse>)> {
    let ip = addr.ip().to_string();

    // 检查速率限制
    if let Err(e) = state.auth_service.check_rate_limit(&ip).await {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse { error: e }),
        ));
    }

    // 加载配置
    let config = PersistentConfig::load().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("加载配置失败: {}", e),
            }),
        )
    })?;

    // 检查是否已初始化
    let password_hash = config.password_hash.ok_or_else(|| {
        (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "密码未设置，请先设置密码".to_string(),
            }),
        )
    })?;

    // 验证密码
    if !AuthService::verify_password(&req.password, &password_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "密码错误".to_string(),
            }),
        ));
    }

    // 确保HMAC密钥已初始化
    state.auth_service.init_hmac_key(&password_hash).await;

    // 生成token
    let token = state.auth_service.generate_token().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        )
    })?;

    Ok(Json(TokenResponse { token }))
}

/// PUT /api/auth/password - 修改密码（需鉴权）
pub async fn change_password_handler(
    State(state): State<AppState>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    // 验证新密码
    if req.password.len() < 6 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "密码至少需要6个字符".to_string(),
            }),
        ));
    }

    if req.password != req.confirm {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "两次输入的密码不一致".to_string(),
            }),
        ));
    }

    // 加载配置
    let config = PersistentConfig::load().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("加载配置失败: {}", e),
            }),
        )
    })?;

    // 验证当前密码
    let old_password_hash = config.password_hash.ok_or_else(|| {
        (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "密码未设置".to_string(),
            }),
        )
    })?;

    if !AuthService::verify_password(&req.current, &old_password_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "当前密码错误".to_string(),
            }),
        ));
    }

    // 哈希新密码
    let new_password_hash = AuthService::hash_password(&req.password).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        )
    })?;

    // 保存配置
    let new_config = PersistentConfig {
        password_hash: Some(new_password_hash.clone()),
        ..config
    };

    new_config.save().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("保存配置失败: {}", e),
            }),
        )
    })?;

    // 更新HMAC密钥（这会使其他设备的token失效）
    state.auth_service.init_hmac_key(&new_password_hash).await;

    Ok(StatusCode::OK)
}

/// POST /api/auth/skip - 跳过密码设置
pub async fn skip_setup_handler(
    State(state): State<AppState>,
) -> Result<Json<TokenResponse>, (StatusCode, Json<ErrorResponse>)> {
    // 检查是否已初始化
    let config = PersistentConfig::load().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("加载配置失败: {}", e),
            }),
        )
    })?;

    if config.is_initialized() {
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "已初始化".to_string(),
            }),
        ));
    }

    // 保存跳过标记
    let new_config = PersistentConfig {
        password_skipped: true,
        ..config
    };

    new_config.save().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("保存配置失败: {}", e),
            }),
        )
    })?;

    // 生成一个特殊的"无密码"token（用随机密钥）
    let dummy_hash = AuthService::hash_password(&format!("skip_{}", Uuid::new_v4()))
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e }),
            )
        })?;
    state.auth_service.init_hmac_key(&dummy_hash).await;

    let token = state.auth_service.generate_token().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        )
    })?;

    Ok(Json(TokenResponse { token }))
}

/// GET /api/auth/status - 查询鉴权状态
pub async fn status_handler() -> Json<StatusResponse> {
    let config = PersistentConfig::load().unwrap_or_default();

    // 如果跳过了密码设置，直接认为已认证（无需登录）
    let authenticated = config.password_skipped;

    Json(StatusResponse {
        initialized: config.is_initialized(),
        authenticated,
    })
}

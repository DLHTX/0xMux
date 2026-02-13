use axum::{Json, extract::Multipart, http::StatusCode};
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct UploadResponse {
    pub path: String,
}

pub async fn upload_image_handler(
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, StatusCode> {
    // 1. 读取第一个文件字段
    let field = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .ok_or(StatusCode::BAD_REQUEST)?;

    let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;

    // 2. 检测文件类型
    let kind = infer::get(&data).ok_or(StatusCode::BAD_REQUEST)?;
    if !kind.mime_type().starts_with("image/") {
        return Err(StatusCode::BAD_REQUEST);
    }

    // 3. 生成文件路径
    let cache_dir = home::home_dir()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .join(".cache/0xmux/images");

    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let filename = format!("{}.{}", Uuid::new_v4(), kind.extension());
    let path = cache_dir.join(&filename);

    // 4. 保存文件
    tokio::fs::write(&path, &data)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(UploadResponse {
        path: path.display().to_string(),
    }))
}

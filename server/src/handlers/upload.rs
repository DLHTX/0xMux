use axum::{
    Json,
    extract::{Multipart, Query},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::services::workspace;

#[derive(Serialize)]
pub struct UploadResponse {
    pub path: String,
    pub url: String,
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
        url: format!("/api/images/{}", filename),
    }))
}

// ── File Upload API ──────────────────────────────────────────────────

const MAX_UPLOAD_SIZE: u64 = 50 * 1024 * 1024; // 50 MB

#[derive(Deserialize)]
pub struct UploadQuery {
    pub dir: Option<String>,
    pub session: Option<String>,
    pub window: Option<u32>,
}

#[derive(Serialize)]
pub struct UploadFileResult {
    pub path: String,
    pub absolute_path: String,
    pub filename: String,
    pub size: u64,
}

/// Sanitize a filename: strip path separators and dangerous components.
fn sanitize_filename(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let sanitized: String = base
        .chars()
        .map(|c| {
            if c == '/' || c == '\\' || c == '\0' {
                '_'
            } else {
                c
            }
        })
        .collect();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "upload".to_string()
    } else {
        sanitized
    }
}

/// If `path` already exists, append (1), (2), ... before the extension.
fn deduplicate_path(path: &std::path::Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("upload");
    let ext = path.extension().and_then(|e| e.to_str());
    let parent = path.parent().unwrap_or(path);
    for i in 1..1000 {
        let new_name = match ext {
            Some(e) => format!("{}({}).{}", stem, i, e),
            None => format!("{}({})", stem, i),
        };
        let candidate = parent.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    // Extremely unlikely fallback
    parent.join(format!("{}_{}", stem, Uuid::new_v4()))
}

pub async fn upload_file_handler(
    Query(q): Query<UploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<Vec<UploadFileResult>>, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;

    // Determine target directory
    let target_dir = if let Some(ref dir) = q.dir {
        // Reject traversal
        if dir.contains("..") {
            return Err(AppError::Forbidden("Path traversal not allowed".into()));
        }
        let joined = root.join(dir);
        let canonical_root = root
            .canonicalize()
            .map_err(|e| AppError::Internal(format!("Cannot resolve root: {e}")))?;
        let canonical_dir = joined
            .canonicalize()
            .map_err(|_| AppError::NotFound(format!("Directory not found: {dir}")))?;
        if !canonical_dir.starts_with(&canonical_root) {
            return Err(AppError::Forbidden("Path escapes project root".into()));
        }
        if !canonical_dir.is_dir() {
            return Err(AppError::BadRequest(format!("Not a directory: {dir}")))?;
        }
        canonical_dir
    } else {
        root.clone()
    };

    let mut results = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {e}")))?
    {
        let original_name = field.file_name().unwrap_or("upload").to_string();
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("Read field error: {e}")))?;

        if data.len() as u64 > MAX_UPLOAD_SIZE {
            return Err(AppError::PayloadTooLarge(format!(
                "File too large: {} bytes (max {})",
                data.len(),
                MAX_UPLOAD_SIZE
            )));
        }

        let safe_name = sanitize_filename(&original_name);
        let dest = deduplicate_path(&target_dir.join(&safe_name));

        tokio::fs::write(&dest, &data)
            .await
            .map_err(|e| AppError::Internal(format!("Write failed: {e}")))?;

        let absolute_path = dest
            .canonicalize()
            .unwrap_or_else(|_| dest.clone())
            .display()
            .to_string();

        let relative_path = dest
            .strip_prefix(&root)
            .unwrap_or(&dest)
            .display()
            .to_string();

        let final_name = dest
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&safe_name)
            .to_string();

        results.push(UploadFileResult {
            path: relative_path,
            absolute_path,
            filename: final_name,
            size: data.len() as u64,
        });
    }

    if results.is_empty() {
        return Err(AppError::BadRequest("No files uploaded".into()));
    }

    Ok(Json(results))
}

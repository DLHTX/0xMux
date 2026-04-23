use axum::{Json, extract::Query, response::IntoResponse};

use crate::error::AppError;
use crate::handlers::git::WorkspaceQuery;
use crate::services::{github, workspace};

pub async fn current_pr_handler(
    Query(q): Query<WorkspaceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let root = workspace::resolve_workspace_root(q.session.as_deref(), q.window)?;

    let response = tokio::task::spawn_blocking(move || github::current_pr(&root))
        .await
        .map_err(|err| AppError::Internal(format!("current pr lookup task failed: {err}")))?;

    Ok(Json(response))
}

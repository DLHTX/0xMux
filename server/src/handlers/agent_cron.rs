use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateJobRequest {
    pub name: String,
    pub schedule: oxmux_agent::cron::CronSchedule,
    pub action: oxmux_agent::cron::CronAction,
}

#[derive(Deserialize)]
pub struct UpdateJobRequest {
    pub name: Option<String>,
    pub schedule: Option<oxmux_agent::cron::CronSchedule>,
    pub action: Option<oxmux_agent::cron::CronAction>,
}

#[derive(Serialize)]
struct CronResponse<T: Serialize> {
    success: bool,
    data: T,
}

fn ok_json<T: Serialize>(data: T) -> impl IntoResponse {
    Json(CronResponse {
        success: true,
        data,
    })
}

pub async fn list_jobs_handler(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let jobs = cron.list_jobs().await;
    Ok(ok_json(jobs))
}

pub async fn create_job_handler(
    State(state): State<AppState>,
    Json(body): Json<CreateJobRequest>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let job = cron
        .add_job(body.name, body.schedule, body.action)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok((StatusCode::CREATED, ok_json(job)))
}

pub async fn get_job_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let job = cron
        .get_job(&id)
        .await
        .ok_or_else(|| AppError::NotFound(format!("Job {id} not found")))?;

    Ok(ok_json(job))
}

pub async fn update_job_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateJobRequest>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let job = cron
        .update_job(&id, body.name, body.schedule, body.action)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(job))
}

pub async fn delete_job_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    cron.delete_job(&id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(serde_json::json!({"deleted": true})))
}

pub async fn run_now_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let result = cron
        .run_now(&id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(result))
}

pub async fn toggle_job_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let cron = state
        .cron_service
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("Agent cron not enabled".into()))?;

    let job = cron
        .toggle_job(&id)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(ok_json(job))
}

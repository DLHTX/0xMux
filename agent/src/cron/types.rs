use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A scheduled job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub schedule: CronSchedule,
    pub action: CronAction,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
    pub consecutive_failures: u32,
    pub last_result: Option<JobResult>,
}

impl CronJob {
    pub fn new(name: String, schedule: CronSchedule, action: CronAction) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            schedule,
            action,
            enabled: true,
            created_at: now,
            updated_at: now,
            last_run: None,
            next_run: None,
            consecutive_failures: 0,
            last_result: None,
        }
    }
}

/// Schedule types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum CronSchedule {
    /// Run once at a specific time
    At(DateTime<Utc>),
    /// Run every N seconds
    Every(u64),
    /// Cron expression (e.g., "0 */5 * * * *")
    Cron(String),
}

/// Action to perform when job triggers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CronAction {
    /// Run a shell command
    RunCommand {
        cmd: String,
        args: Vec<String>,
        cwd: Option<String>,
    },
    /// Open an application
    OpenApp { name: String },
    /// Open a URL in default browser
    OpenUrl { url: String },
    /// Take a screenshot
    Screenshot {
        monitor_id: Option<u32>,
        save_path: Option<String>,
    },
}

/// Result of a job execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResult {
    pub status: JobStatus,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub executed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Success,
    Failed,
    Timeout,
    Skipped,
}

/// Persistent storage format
#[derive(Debug, Serialize, Deserialize)]
pub struct CronStorage {
    pub version: u32,
    pub jobs: Vec<CronJob>,
}

impl Default for CronStorage {
    fn default() -> Self {
        Self {
            version: 1,
            jobs: Vec::new(),
        }
    }
}

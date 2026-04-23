use super::executor;
use super::store;
use super::types::{CronAction, CronJob, CronSchedule, JobResult, JobStatus};
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing;

/// Maximum consecutive failures before auto-disabling a job
const MAX_CONSECUTIVE_FAILURES: u32 = 10;

/// CronService manages scheduled jobs
#[derive(Clone)]
pub struct CronService {
    jobs: Arc<RwLock<Vec<CronJob>>>,
    running: Arc<RwLock<bool>>,
}

impl CronService {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(Vec::new())),
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start the cron service: load stored jobs and begin scheduling
    pub async fn start(&self) -> Result<(), String> {
        // Load from persistent storage
        let stored_jobs = store::load()?;
        {
            let mut jobs = self.jobs.write().await;
            *jobs = stored_jobs;
        }

        // Mark as running
        *self.running.write().await = true;

        // Spawn the scheduler loop
        let service = self.clone();
        tokio::spawn(async move {
            service.scheduler_loop().await;
        });

        tracing::info!(
            "CronService started with {} jobs",
            self.jobs.read().await.len()
        );
        Ok(())
    }

    /// Stop the cron service
    pub async fn stop(&self) {
        *self.running.write().await = false;
    }

    /// List all jobs
    pub async fn list_jobs(&self) -> Vec<CronJob> {
        self.jobs.read().await.clone()
    }

    /// Get a specific job by ID
    pub async fn get_job(&self, id: &str) -> Option<CronJob> {
        self.jobs.read().await.iter().find(|j| j.id == id).cloned()
    }

    /// Add a new job
    pub async fn add_job(
        &self,
        name: String,
        schedule: CronSchedule,
        action: CronAction,
    ) -> Result<CronJob, String> {
        let mut job = CronJob::new(name, schedule, action);
        job.next_run = self.calculate_next_run(&job.schedule);

        let mut jobs = self.jobs.write().await;
        jobs.push(job.clone());
        drop(jobs);

        self.persist().await?;
        Ok(job)
    }

    /// Update an existing job
    pub async fn update_job(
        &self,
        id: &str,
        name: Option<String>,
        schedule: Option<CronSchedule>,
        action: Option<CronAction>,
    ) -> Result<CronJob, String> {
        let mut jobs = self.jobs.write().await;
        let job = jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or_else(|| format!("Job {id} not found"))?;

        if let Some(n) = name {
            job.name = n;
        }
        if let Some(s) = schedule {
            job.schedule = s;
            job.next_run = self.calculate_next_run(&job.schedule);
        }
        if let Some(a) = action {
            job.action = a;
        }
        job.updated_at = Utc::now();

        let updated = job.clone();
        drop(jobs);

        self.persist().await?;
        Ok(updated)
    }

    /// Delete a job
    pub async fn delete_job(&self, id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.write().await;
        let len_before = jobs.len();
        jobs.retain(|j| j.id != id);

        if jobs.len() == len_before {
            return Err(format!("Job {id} not found"));
        }

        drop(jobs);
        self.persist().await
    }

    /// Toggle a job's enabled state
    pub async fn toggle_job(&self, id: &str) -> Result<CronJob, String> {
        let mut jobs = self.jobs.write().await;
        let job = jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or_else(|| format!("Job {id} not found"))?;

        job.enabled = !job.enabled;
        if job.enabled {
            job.consecutive_failures = 0;
            job.next_run = self.calculate_next_run(&job.schedule);
        }
        job.updated_at = Utc::now();

        let toggled = job.clone();
        drop(jobs);

        self.persist().await?;
        Ok(toggled)
    }

    /// Manually trigger a job
    pub async fn run_now(&self, id: &str) -> Result<JobResult, String> {
        let action = {
            let jobs = self.jobs.read().await;
            let job = jobs
                .iter()
                .find(|j| j.id == id)
                .ok_or_else(|| format!("Job {id} not found"))?;
            job.action.clone()
        };

        let result = executor::execute(&action).await;

        // Update job state
        {
            let mut jobs = self.jobs.write().await;
            if let Some(job) = jobs.iter_mut().find(|j| j.id == id) {
                job.last_run = Some(result.executed_at);
                job.last_result = Some(result.clone());
                if result.status == JobStatus::Success {
                    job.consecutive_failures = 0;
                } else {
                    job.consecutive_failures += 1;
                }
            }
        }

        self.persist().await?;
        Ok(result)
    }

    // --- Internal ---

    async fn scheduler_loop(&self) {
        loop {
            if !*self.running.read().await {
                break;
            }

            self.check_and_run_due_jobs().await;

            // Check every second
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    async fn check_and_run_due_jobs(&self) {
        let now = Utc::now();
        let due_jobs: Vec<(String, CronAction)> = {
            let jobs = self.jobs.read().await;
            jobs.iter()
                .filter(|j| {
                    j.enabled
                        && j.consecutive_failures < MAX_CONSECUTIVE_FAILURES
                        && j.next_run.is_some_and(|nr| nr <= now)
                })
                .map(|j| (j.id.clone(), j.action.clone()))
                .collect()
        };

        for (id, action) in due_jobs {
            let result = executor::execute(&action).await;

            let mut jobs = self.jobs.write().await;
            if let Some(job) = jobs.iter_mut().find(|j| j.id == id) {
                job.last_run = Some(result.executed_at);
                job.last_result = Some(result.clone());

                if result.status == JobStatus::Success {
                    job.consecutive_failures = 0;
                } else {
                    job.consecutive_failures += 1;
                    if job.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        tracing::warn!(
                            "Job '{}' auto-disabled after {} consecutive failures",
                            job.name,
                            job.consecutive_failures
                        );
                        job.enabled = false;
                    }
                }

                // Calculate next run based on schedule type
                match &job.schedule {
                    CronSchedule::At(_) => {
                        // One-time: disable after execution
                        job.enabled = false;
                        job.next_run = None;
                    }
                    _ => {
                        job.next_run = self.calculate_next_run(&job.schedule);
                    }
                }
            }
            drop(jobs);
        }

        // Persist after processing
        if let Err(e) = self.persist().await {
            tracing::error!("Failed to persist cron jobs: {e}");
        }
    }

    fn calculate_next_run(&self, schedule: &CronSchedule) -> Option<chrono::DateTime<Utc>> {
        let now = Utc::now();
        match schedule {
            CronSchedule::At(time) => {
                if *time > now {
                    Some(*time)
                } else {
                    None
                }
            }
            CronSchedule::Every(secs) => Some(now + chrono::Duration::seconds(*secs as i64)),
            CronSchedule::Cron(_expr) => {
                // For now, use a simple interval fallback
                // Full cron parsing can be added with the croner crate
                Some(now + chrono::Duration::minutes(1))
            }
        }
    }

    async fn persist(&self) -> Result<(), String> {
        let jobs = self.jobs.read().await;
        store::save(&jobs)
    }
}

impl Default for CronService {
    fn default() -> Self {
        Self::new()
    }
}

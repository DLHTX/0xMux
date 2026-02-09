use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PtySession {
    pub id: String,
    pub session_name: String,
    pub cols: u16,
    pub rows: u16,
    pub pid: u32,
    pub created_at: DateTime<Utc>,
}

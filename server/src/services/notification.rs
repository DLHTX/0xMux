use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

const MAX_NOTIFICATIONS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub title: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub category: String,
    pub read: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Clone)]
pub struct NotificationService {
    notifications: Arc<RwLock<Vec<Notification>>>,
    storage_path: PathBuf,
}

impl NotificationService {
    pub fn new() -> Self {
        let storage_path = home::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".cache/0xmux/notifications.json");

        let notifications = Self::load_from_disk(&storage_path);

        Self {
            notifications: Arc::new(RwLock::new(notifications)),
            storage_path,
        }
    }

    fn load_from_disk(path: &PathBuf) -> Vec<Notification> {
        match std::fs::read_to_string(path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    async fn persist(&self) {
        let notifications = self.notifications.read().await;
        if let Some(parent) = self.storage_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(data) = serde_json::to_string_pretty(&*notifications) {
            let _ = tokio::fs::write(&self.storage_path, data).await;
        }
    }

    pub async fn create(
        &self,
        title: String,
        message: String,
        image_url: Option<String>,
        category: Option<String>,
    ) -> Notification {
        let notification = Notification {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            message,
            image_url,
            category: category.unwrap_or_else(|| "info".to_string()),
            read: false,
            timestamp: Utc::now(),
        };

        let mut notifications = self.notifications.write().await;
        notifications.insert(0, notification.clone());

        // Trim to max
        if notifications.len() > MAX_NOTIFICATIONS {
            notifications.truncate(MAX_NOTIFICATIONS);
        }

        drop(notifications);
        self.persist().await;

        notification
    }

    pub async fn list(&self, limit: usize) -> (Vec<Notification>, usize) {
        let notifications = self.notifications.read().await;
        let unread_count = notifications.iter().filter(|n| !n.read).count();
        let items: Vec<Notification> = notifications.iter().take(limit).cloned().collect();
        (items, unread_count)
    }

    pub async fn delete(&self, id: &str) -> bool {
        let mut notifications = self.notifications.write().await;
        let len_before = notifications.len();
        notifications.retain(|n| n.id != id);
        let removed = notifications.len() < len_before;
        drop(notifications);
        if removed {
            self.persist().await;
        }
        removed
    }

    pub async fn mark_read(&self, id: &str) -> bool {
        let mut notifications = self.notifications.write().await;
        if let Some(n) = notifications.iter_mut().find(|n| n.id == id) {
            n.read = true;
            drop(notifications);
            self.persist().await;
            true
        } else {
            false
        }
    }

    pub async fn mark_all_read(&self) {
        let mut notifications = self.notifications.write().await;
        for n in notifications.iter_mut() {
            n.read = true;
        }
        drop(notifications);
        self.persist().await;
    }
}

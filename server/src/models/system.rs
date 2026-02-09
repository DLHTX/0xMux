use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug)]
pub struct DependencyInfo {
    pub name: String,
    pub required: bool,
    pub installed: bool,
    pub version: Option<String>,
    pub min_version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SystemDepsResponse {
    pub os: String,
    pub arch: String,
    pub package_manager: Option<String>,
    pub dependencies: Vec<DependencyInfo>,
}

#[derive(Serialize, Clone, Debug)]
pub struct InstallTaskInfo {
    pub task_id: String,
    pub package: String,
    pub status: String,
    pub ws_url: String,
}

#[derive(Deserialize)]
pub struct InstallRequest {
    pub package: String,
}

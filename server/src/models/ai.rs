use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug)]
pub struct ProviderAvailability {
    pub installed: bool,
    pub command: String,
    pub path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiProvidersStatus {
    pub claude: ProviderAvailability,
    pub codex: ProviderAvailability,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiStatusResponse {
    pub providers: AiProvidersStatus,
    pub show_plugin_button: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProviderSyncState {
    pub exists: bool,
    pub in_sync: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SkillCatalogItem {
    pub id: String,
    pub name: String,
    pub source: String,
    pub claude: ProviderSyncState,
    pub codex: ProviderSyncState,
}

#[derive(Serialize, Clone, Debug)]
pub struct McpCatalogItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub source: String,
    pub claude: ProviderSyncState,
    pub codex: ProviderSyncState,
    pub recommended: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiCatalogResponse {
    pub skills: Vec<SkillCatalogItem>,
    pub mcp: Vec<McpCatalogItem>,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct AiSyncRequest {
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub ids: Vec<String>,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SyncAction {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub provider: String,
    pub status: String,
    pub source: Option<String>,
    pub target: Option<String>,
    pub message: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct SyncSummary {
    pub total: usize,
    pub updated: usize,
    pub planned: usize,
    pub up_to_date: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiSyncResponse {
    pub dry_run: bool,
    pub actions: Vec<SyncAction>,
    pub summary: SyncSummary,
}

#[derive(Deserialize, Clone, Debug, Default)]
pub struct AiUninstallRequest {
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub ids: Vec<String>,
    #[serde(default)]
    pub remove_source: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct UninstallSummary {
    pub total: usize,
    pub removed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub not_found: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiUninstallResponse {
    pub actions: Vec<SyncAction>,
    pub summary: UninstallSummary,
}

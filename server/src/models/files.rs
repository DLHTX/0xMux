use serde::{Deserialize, Serialize};

/// File tree node
#[derive(Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: FileNodeType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignored: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileNodeType {
    File,
    Directory,
}

/// File read response
#[derive(Serialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub language: String,
    pub size: u64,
    pub encoding: String,
}

/// File write request
#[derive(Deserialize)]
pub struct FileWriteRequest {
    pub path: String,
    pub content: String,
    pub session: Option<String>,
    pub window: Option<u32>,
}

/// Search query parameters
#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: String,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case: bool,
    pub glob: Option<String>,
    #[serde(default = "default_max_results")]
    pub max: usize,
    pub session: Option<String>,
    pub window: Option<u32>,
}

fn default_max_results() -> usize {
    200
}

/// Single search match
#[derive(Serialize)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: u64,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

/// Search results grouped by file
#[derive(Serialize)]
pub struct SearchResultGroup {
    pub file_path: String,
    pub matches: Vec<SearchMatch>,
}

/// Search response
#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResultGroup>,
    pub total_files: usize,
    pub total_matches: usize,
    pub truncated: bool,
}

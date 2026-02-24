use serde::{Deserialize, Serialize};

/// A browser session managed by Playwright
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSession {
    pub id: String,
    pub tabs: Vec<BrowserTab>,
}

/// A browser tab
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTab {
    pub index: u32,
    pub url: String,
    pub title: String,
}

/// Accessibility snapshot of a page
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageSnapshot {
    pub url: String,
    pub title: String,
    pub elements: Vec<PageElement>,
    pub total_elements: u32,
}

/// A page element from the accessibility tree (ref IDs prefixed with "r")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageElement {
    pub ref_id: String,
    pub role: String,
    pub name: String,
    pub value: Option<String>,
}

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum CurrentPrStatus {
    Draft,
    Approved,
    ChangesRequested,
    ReviewRequired,
    Open,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CurrentPrResponse {
    Ready {
        number: u64,
        title: String,
        url: String,
        status: CurrentPrStatus,
        extra_count: usize,
    },
    NoPr,
    GhUnavailable {
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    Error {
        message: String,
    },
}

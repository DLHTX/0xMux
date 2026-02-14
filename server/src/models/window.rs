use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TmuxWindow {
    pub index: u32,
    pub name: String,
    pub active: bool,
    pub panes: u32,
}

#[derive(Deserialize)]
pub struct CreateWindowRequest {
    pub window_name: Option<String>,
}

#[derive(Deserialize)]
pub struct SendInputRequest {
    pub data: String,
}

#[derive(Deserialize)]
pub struct CaptureQuery {
    pub lines: Option<u32>,
}

#[derive(Serialize)]
pub struct CaptureResponse {
    pub output: String,
}

#[derive(Serialize)]
pub struct WindowInfoResponse {
    pub index: u32,
    pub name: String,
    pub pane_pid: String,
    pub pane_current_path: String,
    pub pane_current_command: String,
}

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(
    name = "0xmux",
    version,
    about = "Hacker-grade tmux session manager with web UI"
)]
pub struct ServerConfig {
    #[arg(short, long, default_value = "1234", env = "PORT")]
    pub port: u16,

    #[arg(long, default_value = "0.0.0.0", env = "HOST")]
    pub host: String,

    /// Use a named tmux socket (-L). Allows multiple 0xMux instances with
    /// completely isolated tmux sessions (e.g. `--tmux-socket 0xmux-dev`).
    #[arg(long, env = "TMUX_SOCKET")]
    pub tmux_socket: Option<String>,
}

impl ServerConfig {
    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(name = "0xmux", version, about = "Hacker-grade tmux session manager with web UI")]
pub struct ServerConfig {
    #[arg(short, long, default_value = "1234", env = "PORT")]
    pub port: u16,

    #[arg(long, default_value = "127.0.0.1", env = "HOST")]
    pub host: String,
}

impl ServerConfig {
    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

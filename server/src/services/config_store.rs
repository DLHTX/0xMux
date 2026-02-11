use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistentConfig {
    #[serde(default)]
    pub password_hash: Option<String>,

    #[serde(default)]
    pub password_skipped: bool,

    #[serde(default)]
    pub external_access: bool,

    #[serde(default)]
    pub allow_remote_install: bool,

    #[serde(default)]
    pub allow_remote_restart: bool,
}

impl PersistentConfig {
    pub fn config_path() -> io::Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, "无法获取用户主目录")
        })?;
        let config_dir = home.join(".config").join("0xmux");
        fs::create_dir_all(&config_dir)?;
        Ok(config_dir.join("config.toml"))
    }

    pub fn load() -> io::Result<Self> {
        let path = Self::config_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)?;
        toml::from_str(&content).map_err(|e| {
            io::Error::new(io::ErrorKind::InvalidData, format!("配置文件解析失败: {}", e))
        })
    }

    pub fn save(&self) -> io::Result<()> {
        let path = Self::config_path()?;
        let content = toml::to_string_pretty(self).map_err(|e| {
            io::Error::new(io::ErrorKind::InvalidData, format!("配置序列化失败: {}", e))
        })?;

        fs::write(&path, content)?;

        // 设置文件权限为0600（仅所有者可读写）
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&path, perms)?;
        }

        Ok(())
    }

    pub fn is_initialized(&self) -> bool {
        self.password_hash.is_some() || self.password_skipped
    }
}

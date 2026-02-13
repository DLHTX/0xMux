use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

type HmacSha256 = Hmac<Sha256>;

const TOKEN_LIFETIME_SECS: u64 = 7 * 24 * 3600; // 7天

#[derive(Clone)]
pub struct AuthService {
    valid_tokens: Arc<RwLock<HashSet<String>>>,
    rate_limit: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    hmac_key: Arc<RwLock<Option<Vec<u8>>>>,
}

#[derive(Debug, Clone)]
struct RateLimitEntry {
    attempts: u32,
    locked_until: Option<SystemTime>,
}

impl AuthService {
    pub fn new() -> Self {
        Self {
            valid_tokens: Arc::new(RwLock::new(HashSet::new())),
            rate_limit: Arc::new(RwLock::new(HashMap::new())),
            hmac_key: Arc::new(RwLock::new(None)),
        }
    }

    /// 哈希密码
    pub fn hash_password(password: &str) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();

        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|e| format!("密码哈希失败: {}", e))
    }

    /// 验证密码
    pub fn verify_password(password: &str, hash: &str) -> bool {
        let parsed_hash = match PasswordHash::new(hash) {
            Ok(h) => h,
            Err(_) => return false,
        };

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok()
    }

    /// 从密码派生HMAC密钥
    fn derive_hmac_key(password_hash: &str) -> Vec<u8> {
        use sha2::Digest;
        let mut hasher = Sha256::new();
        hasher.update(password_hash.as_bytes());
        hasher.finalize().to_vec()
    }

    /// 初始化HMAC密钥（在设置密码或修改密码后调用）
    pub async fn init_hmac_key(&self, password_hash: &str) {
        let key = Self::derive_hmac_key(password_hash);
        *self.hmac_key.write().await = Some(key);
    }

    /// 生成token
    pub async fn generate_token(&self) -> Result<String, String> {
        // 生成64字符hex随机token
        let mut token_bytes = [0u8; 32];
        use rand::RngCore;
        OsRng.fill_bytes(&mut token_bytes);
        let token = hex::encode(token_bytes);

        // 签名token
        let signed_token = self.sign_token(&token).await?;

        // 存储到valid_tokens
        self.valid_tokens.write().await.insert(signed_token.clone());

        Ok(signed_token)
    }

    /// 对token进行HMAC签名（格式：token.timestamp.signature）
    async fn sign_token(&self, token: &str) -> Result<String, String> {
        let key_guard = self.hmac_key.read().await;
        let key = key_guard.as_ref().ok_or("HMAC密钥未初始化")?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let payload = format!("{}.{}", token, timestamp);

        let mut mac =
            HmacSha256::new_from_slice(key).map_err(|e| format!("HMAC初始化失败: {}", e))?;
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        Ok(format!("{}.{}", payload, signature))
    }

    /// 验证token（检查签名和过期时间）
    pub async fn verify_token(&self, signed_token: &str) -> bool {
        // 检查是否在valid_tokens中（多设备登录支持）
        if !self.valid_tokens.read().await.contains(signed_token) {
            // 如果不在缓存中，尝试验证签名和过期时间
            if !self.verify_token_signature(signed_token).await {
                return false;
            }
            // 验证通过，加入缓存
            self.valid_tokens
                .write()
                .await
                .insert(signed_token.to_string());
        }
        true
    }

    /// 验证token签名和过期时间
    async fn verify_token_signature(&self, signed_token: &str) -> bool {
        let parts: Vec<&str> = signed_token.split('.').collect();
        if parts.len() != 3 {
            return false;
        }

        let token = parts[0];
        let timestamp_str = parts[1];
        let signature = parts[2];

        // 解析时间戳
        let timestamp: u64 = match timestamp_str.parse() {
            Ok(t) => t,
            Err(_) => return false,
        };

        // 检查过期时间
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        if now > timestamp + TOKEN_LIFETIME_SECS {
            return false;
        }

        // 验证签名
        let key_guard = self.hmac_key.read().await;
        let key = match key_guard.as_ref() {
            Some(k) => k,
            None => return false,
        };

        let payload = format!("{}.{}", token, timestamp);
        let mut mac = match HmacSha256::new_from_slice(key) {
            Ok(m) => m,
            Err(_) => return false,
        };
        mac.update(payload.as_bytes());

        let expected_signature = hex::encode(mac.finalize().into_bytes());
        expected_signature == signature
    }

    /// 检查速率限制
    pub async fn check_rate_limit(&self, ip: &str) -> Result<(), String> {
        let mut rate_limit = self.rate_limit.write().await;
        let now = SystemTime::now();

        let entry = rate_limit.entry(ip.to_string()).or_insert(RateLimitEntry {
            attempts: 0,
            locked_until: None,
        });

        // 检查是否被锁定
        if let Some(locked_until) = entry.locked_until {
            if now < locked_until {
                let remaining = locked_until.duration_since(now).unwrap_or(Duration::ZERO);
                return Err(format!("操作过于频繁，请 {} 秒后再试", remaining.as_secs()));
            } else {
                // 锁定到期，重置
                entry.attempts = 0;
                entry.locked_until = None;
            }
        }

        // 检查1分钟内的尝试次数（简化实现：累计次数）
        entry.attempts += 1;

        if entry.attempts > 5 {
            // 锁定15分钟
            entry.locked_until = Some(now + Duration::from_secs(15 * 60));
            return Err("登录失败次数过多，已锁定15分钟".to_string());
        }

        Ok(())
    }

    /// 登录成功后重置速率限制（可选，根据需求）
    #[allow(dead_code)]
    pub async fn reset_rate_limit(&self, _ip: &str) {
        // 根据spec，成功登录不重置失败计数器
        // 所以这个函数留空
    }

    /// 清理过期的速率限制记录（可以在后台定期调用）
    #[allow(dead_code)]
    pub async fn cleanup_rate_limit(&self) {
        let mut rate_limit = self.rate_limit.write().await;
        let now = SystemTime::now();

        rate_limit.retain(|_, entry| {
            if let Some(locked_until) = entry.locked_until {
                now < locked_until
            } else {
                // 保留未锁定的记录（简化实现）
                true
            }
        });
    }
}

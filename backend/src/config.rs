use crate::Result;
use confique::Config as _;
use secrecy::SecretString;
use std::{net::SocketAddr, path::PathBuf};

#[derive(confique::Config, Debug, Clone)]
pub struct Config {
    #[config(env = "PAIRIDAEZA_ADDR", default = "127.0.0.1:17800")]
    pub listen: SocketAddr,
    #[config(env = "PAIRIDAEZA_WEB_DIST")]
    pub web_dist: Option<PathBuf>,
    #[config(env = "PAIRIDAEZA_DATA_DIR")]
    pub data_dir: Option<PathBuf>,
    #[config(env = "PAIRIDAEZA_MOCK_AUTH", default = false)]
    pub mock_auth: bool,
    #[config(nested)]
    pub auth: Auth,
}

#[derive(confique::Config, Debug, Clone)]
pub struct Auth {
    #[config(env = "PAIRIDAEZA_AUTH__ISSUER", default = "https://auth.lotsa.ai")]
    pub issuer: String,
    #[config(env = "PAIRIDAEZA_AUTH__CLIENT_ID", default = "")]
    pub client_id: String,
    #[config(env = "PAIRIDAEZA_AUTH__PROJECT_ID", default = "")]
    pub project_id: String,
    #[config(
        env = "PAIRIDAEZA_AUTH__REDIRECT_URI",
        default = "http://127.0.0.1:17800/auth/zitadel/callback"
    )]
    pub redirect_uri: String,
    #[config(env = "PAIRIDAEZA_AUTH__SESSION_KEY")]
    pub session_key: Option<SecretString>,
    #[config(env = "PAIRIDAEZA_AUTH__SESSION_TTL_HOURS", default = 24)]
    pub session_ttl_hours: u32,
    #[config(env = "PAIRIDAEZA_AUTH__JWKS_REFRESH_SECONDS", default = 600)]
    pub jwks_refresh_seconds: u64,
    #[config(env = "PAIRIDAEZA_AUTH__LEEWAY_SECONDS", default = 60)]
    pub leeway_seconds: u64,
}

impl Config {
    pub fn load() -> Result<Self> {
        let mut builder = Self::builder().env();
        if let Some(dir) = dirs::config_dir() {
            builder = builder.file(dir.join("pairidaeza").join("backend.toml"));
        }
        Ok(builder.load()?)
    }
    pub fn data_dir(&self) -> eyre::Result<PathBuf> {
        self.data_dir
            .clone()
            .or_else(|| dirs::data_dir().map(|dir| dir.join("pairidaeza")))
            .ok_or_else(|| eyre::eyre!("set PAIRIDAEZA_DATA_DIR"))
    }
}

#[cfg(test)]
impl Config {
    pub(crate) fn test_default() -> Self {
        Self {
            listen: "127.0.0.1:0".parse().unwrap(),
            web_dist: None,
            data_dir: Some(
                std::env::temp_dir().join(format!("pairidaeza-test-{}", uuid::Uuid::new_v4())),
            ),
            mock_auth: false,
            auth: Auth::test_default(),
        }
    }
}
#[cfg(test)]
impl Auth {
    pub(crate) fn test_default() -> Self {
        Self {
            issuer: "https://auth.invalid".into(),
            client_id: "test-client".into(),
            project_id: "test-project".into(),
            redirect_uri: "http://127.0.0.1/callback".into(),
            session_key: None,
            session_ttl_hours: 24,
            jwks_refresh_seconds: 600,
            leeway_seconds: 60,
        }
    }
}

use crate::Result;
use confique::Config as _;
use std::net::SocketAddr;

/// API server and JWT validation settings.
#[derive(confique::Config, Debug, Clone)]
pub struct Config {
  /// The API server's listening address.
  #[config(env = "PAIRIDAEZA_ADDR", default = "127.0.0.1:17810")]
  pub listen: SocketAddr,
  /// JWT validation settings.
  #[config(nested)]
  pub auth: Auth,
}

/// Zitadel issuer, audience, and JWT verification policy.
#[derive(confique::Config, Debug, Clone)]
pub struct Auth {
  /// The expected JWT issuer.
  #[config(env = "PAIRIDAEZA_AUTH__ISSUER", default = "https://auth.lotsa.ai")]
  pub issuer: String,
  /// The API project's expected audience.
  #[config(env = "PAIRIDAEZA_AUTH__PROJECT_ID", default = "")]
  pub project_id: String,
  /// The JWKS cache refresh interval in seconds.
  #[config(env = "PAIRIDAEZA_AUTH__JWKS_REFRESH_SECONDS", default = 600)]
  pub jwks_refresh_seconds: u64,
}

impl Config {
  /// Loads API settings from the environment and the user configuration file.
  ///
  /// # Errors
  /// Returns a configuration error for invalid or unreadable settings.
  pub fn load() -> Result<Self> {
    let mut builder = Self::builder().env();
    if let Some(dir) = dirs::config_dir() {
      builder = builder.file(dir.join("pairidaeza").join("backend.toml"));
    }
    Ok(builder.load()?)
  }
}

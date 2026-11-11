use secrecy::SecretString;
use std::{net::SocketAddr, path::PathBuf};

/// Browser asset and authentication settings.
#[derive(confique::Config, Debug, Clone)]
pub struct Config {
  /// The browser server's listening address.
  #[config(env = "PAIRIDAEZA_WEB_ADDR", default = "127.0.0.1:17811")]
  pub listen: SocketAddr,
  /// The packaged browser application's asset directory.
  #[config(env = "PAIRIDAEZA_WEB_DIST", default = "public")]
  pub web_dist: PathBuf,
  /// Public origin used for redirects and CSRF checks.
  #[config(env = "PAIRIDAEZA_WEB_ORIGIN", default = "http://127.0.0.1:17800")]
  pub origin: String,
  /// Base URL of the bearer-token API.
  #[config(env = "PAIRIDAEZA_API_URL", default = "http://127.0.0.1:17810")]
  pub api_url: String,
  /// PostgreSQL connection string for browser sessions.
  #[config(env = "PAIRIDAEZA_DATABASE_URL")]
  pub database_url: SecretString,
  /// Browser OAuth and session settings.
  #[config(nested)]
  pub auth: Auth,
}

/// Zitadel login and server-side browser-session settings.
#[derive(confique::Config, Debug, Clone)]
pub struct Auth {
  /// The Zitadel issuer.
  #[config(env = "PAIRIDAEZA_AUTH__ISSUER", default = "https://auth.lotsa.ai")]
  pub issuer: String,
  /// The browser application's OAuth client ID.
  #[config(env = "PAIRIDAEZA_AUTH__CLIENT_ID", default = "")]
  pub client_id: String,
  /// The trusted native application in the same Zitadel project.
  #[config(env = "PAIRIDAEZA_AUTH__NATIVE_CLIENT_ID", default = "")]
  pub native_client_id: String,
  /// The API project's audience identifier.
  #[config(env = "PAIRIDAEZA_AUTH__PROJECT_ID", default = "")]
  pub project_id: String,
  /// The browser application's registered OAuth callback URI.
  #[config(env = "PAIRIDAEZA_AUTH__REDIRECT_URI", default = "http://127.0.0.1:17800/auth/zitadel/callback")]
  pub redirect_uri: String,
  /// The browser-session lifetime in hours.
  #[config(env = "PAIRIDAEZA_AUTH__SESSION_TTL_HOURS", default = 24)]
  pub session_ttl_hours: u32,
}

use std::{io, net::SocketAddr};
use thiserror::Error;
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Error)]
pub enum Error {
    /// Config failed to load from the environment.
    #[error(transparent)]
    ConfigLoad(#[from] confique::Error),
    /// The server socket failed.
    #[error(transparent)]
    Io(#[from] io::Error),
    /// The server was asked to bind a non-loopback address.
    #[error(
        "refusing to bind non-loopback address {0}: pairidaeza-backend serves plain HTTP behind tailscale serve"
    )]
    NonLoopbackBind(SocketAddr),
    /// The auth surface was used without a session key configured.
    #[error("auth is not configured: set PAIRIDAEZA_AUTH__SESSION_KEY")]
    AuthNotConfigured,
    /// The configured session key is unusable for HMAC.
    #[error("session key rejected by HMAC")]
    BadSessionKey,
    /// No login is in flight under that state id, or its token was claimed.
    #[error("unknown or expired login state")]
    UnknownAuthState,
    /// A presented session token failed prefix, signature, or expiry checks.
    #[error("invalid session token")]
    InvalidSessionToken,
    /// Zitadel discovery, JWKS, or the token endpoint could not be reached or
    /// answered.
    #[error("zitadel request failed")]
    ZitadelHttp(#[from] reqwest::Error),
    /// Zitadel rejected the authorization code.
    #[error("zitadel token exchange failed with status {status}")]
    CodeExchange { status: u16 },
    /// The id_token failed signature, issuer, audience, or expiry validation.
    #[error("id_token validation failed")]
    IdToken(#[from] jsonwebtoken::errors::Error),
    /// The token response carried no id_token.
    #[error("token response has no id_token")]
    IdTokenMissing,
    /// The id_token header names no signing key.
    #[error("id_token has no key id")]
    IdTokenMissingKid,
    /// The id_token is signed with an algorithm outside RS256 and ES256.
    #[error("id_token algorithm not allowed")]
    IdTokenAlgorithm,
    /// The id_token nonce is not the one this login started with.
    #[error("id_token nonce mismatch")]
    IdTokenNonce,
    /// The id_token carries no email claim.
    #[error("id_token has no email claim")]
    IdTokenMissingEmail,
    /// No JWKS key matches the id_token's key id.
    #[error("unknown zitadel signing key")]
    UnknownSigningKey,
    /// A configured or discovered URL does not parse.
    #[error("url parse failed")]
    UrlParse(#[from] url::ParseError),
    /// JSON serialization or deserialization failed.
    #[error("json failed")]
    SerdeJson(#[from] serde_json::Error),
    /// Time arithmetic or parsing failed.
    #[error("time failed")]
    Time(#[from] jiff::Error),
}

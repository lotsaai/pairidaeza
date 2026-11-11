//! JWT authentication vendored from axum-jwt-auth.
//!
//! Upstream: https://github.com/cmackenzie1/axum-jwt-auth/tree/0855b9cc4dcca4827073b4d7f4efe435a827e8ce
//! License: MIT, retained in `jwtauth/LICENSE`.

mod axum;
mod local;
mod remote;

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use jsonwebtoken::TokenData;
use serde::de::DeserializeOwned;

pub use self::axum::{
  AuthError, BearerTokenExtractor, Claims, CookieTokenExtractor, ExtractorConfig, HeaderTokenExtractor, TokenExtractor,
};
pub use self::local::LocalDecoder;
pub use self::remote::{RemoteJwksDecoder, RemoteJwksDecoderBuilder, RemoteJwksDecoderConfig, RemoteJwksDecoderConfigBuilder};

/// Errors that can occur during JWT decoding and validation.
#[derive(Debug, thiserror::Error)]
pub enum Error {
  /// The JWT's `kid` (key ID) was not found in the key cache.
  #[error("JWT key not found (kid: {0:?})")]
  KeyNotFound(Option<String>),

  /// Invalid decoder configuration (e.g., missing keys, algorithms, or audience).
  #[error("Configuration error: {0}")]
  Configuration(String),

  /// JWT validation or decoding error from the `jsonwebtoken` crate.
  #[error("JWT error: {0}")]
  Jwt(#[from] jsonwebtoken::errors::Error),

  /// HTTP request error when fetching remote JWKS.
  #[error("HTTP request error: {0}")]
  Reqwest(#[from] reqwest::Error),

  /// JWKS refresh failed after exhausting all retry attempts.
  #[error("JWKS refresh failed after {retry_count} attempts: {message}")]
  JwksRefresh {
    message: String,
    retry_count: usize,
    #[source]
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
  },
}

/// Trait for decoding and validating JWT tokens.
///
/// Implemented by [`LocalDecoder`] and [`RemoteJwksDecoder`] to provide
/// a unified interface for JWT validation with different key sources.
pub trait JwtDecoder<T>: Send + Sync
where
  T: DeserializeOwned,
{
  /// Decodes and validates a JWT token string, returning the parsed claims.
  ///
  /// # Errors
  ///
  /// Returns an error if the token is invalid, expired, has an invalid signature,
  /// or if the key cannot be found (for remote decoders).
  fn decode<'a>(&'a self, token: &'a str) -> Pin<Box<dyn Future<Output = Result<TokenData<T>, Error>> + Send + 'a>>;
}

/// Type alias for a thread-safe, trait-object decoder suitable for Axum state.
///
/// Use this with `Arc::new(decoder)` to share a decoder across request handlers.
pub type Decoder<T> = Arc<dyn JwtDecoder<T> + Send + Sync>;

#[cfg(test)]
mod tests;

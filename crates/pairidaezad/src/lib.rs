//! API configuration and JWT authentication used by the server executable.

mod axumext;
mod config;
mod error;
mod server;

pub use axumext::{
  AuthError, BearerTokenExtractor, Claims, CookieTokenExtractor, Decoder, ExtractorConfig, HeaderTokenExtractor, JwtDecoder, JwtError,
  LocalDecoder, RemoteJwksDecoder, RemoteJwksDecoderBuilder, RemoteJwksDecoderConfig, RemoteJwksDecoderConfigBuilder, TokenExtractor,
};
pub use config::{Auth, Config};
pub use error::{Error, Result};
pub use server::application;

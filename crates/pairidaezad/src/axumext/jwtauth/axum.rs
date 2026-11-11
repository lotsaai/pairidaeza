use std::marker::PhantomData;

use axum::RequestPartsExt;
use axum::extract::FromRef;
use axum::http::{StatusCode, header::HeaderName};
use axum::response::Response;
use axum::{http::request::Parts, response::IntoResponse};
use axum_extra::TypedHeader;
use axum_extra::headers::authorization::Bearer;
use axum_extra::headers::{Authorization, Cookie};
use jsonwebtoken::errors::ErrorKind;
use serde::de::DeserializeOwned;

use super::Decoder;

/// Axum extractor for validated JWT claims.
///
/// Extracts and validates JWT tokens from HTTP requests. The generic parameter `T` represents
/// your claims type, and `E` specifies the token extraction strategy (defaults to `BearerTokenExtractor`).
///
/// # State Setup
///
/// Use `Decoder<T>` directly in your application state with `FromRef`:
///
/// ```ignore
/// use axum::extract::FromRef;
/// use axum_jwt_auth::{Decoder, LocalDecoder};
/// use std::sync::Arc;
///
/// #[derive(Clone, FromRef)]
/// struct AppState {
///     decoder: Decoder<MyClaims>,
/// }
///
/// let decoder = LocalDecoder::builder()
///     .keys(keys)
///     .validation(validation)
///     .build()
///     .unwrap();
///
/// let state = AppState {
///     decoder: Arc::new(decoder),
/// };
/// ```
///
/// # Handler Examples
///
/// ```ignore
/// // Default: Extract from Authorization: Bearer <token>
/// async fn handler(user: Claims<MyClaims>) -> Json<MyClaims> {
///     Json(user.claims)
/// }
///
/// // Extract from custom header
/// define_header_extractor!(XAuthToken, "x-auth-token");
/// async fn handler(user: Claims<MyClaims, HeaderTokenExtractor<XAuthToken>>) {
///     // ...
/// }
///
/// // Extract from cookie
/// define_cookie_extractor!(AuthCookie, "auth_token");
/// async fn handler(user: Claims<MyClaims, CookieTokenExtractor<AuthCookie>>) {
///     // ...
/// }
/// ```
#[derive(Debug)]
pub struct Claims<T, E = BearerTokenExtractor> {
  /// The validated JWT claims payload
  pub claims: T,
  _extractor: PhantomData<E>,
}

/// Trait for extracting JWT tokens from HTTP requests.
///
/// Implement this trait to define custom token extraction strategies.
/// The library provides implementations for common sources via the extractor macros.
pub trait TokenExtractor: Send + Sync {
  /// Extracts a JWT token string from the request parts.
  ///
  /// Returns `AuthError::MissingToken` if the token cannot be found or extracted.
  fn extract_token(parts: &mut Parts) -> impl std::future::Future<Output = Result<String, AuthError>> + Send;
}

/// Extracts JWT tokens from the `Authorization: Bearer <token>` header.
///
/// This is the default extractor used by `Claims<T>` when no extractor is specified.
pub struct BearerTokenExtractor;

impl TokenExtractor for BearerTokenExtractor {
  async fn extract_token(parts: &mut Parts) -> Result<String, AuthError> {
    let auth: TypedHeader<Authorization<Bearer>> = parts.extract().await.map_err(|_| AuthError::MissingToken)?;

    Ok(auth.token().to_string())
  }
}

/// Provides configuration values for token extractors.
///
/// Implement this trait to specify custom header names or cookie names
/// Typically used with the `define_*_extractor!` macros rather than implemented manually.
pub trait ExtractorConfig: Send + Sync {
  /// Returns the header name or cookie name to extract from.
  fn value() -> &'static str;
}

/// Creates a custom header token extractor with the given name and header value.
///
/// # Examples
///
/// ```
/// use axum_jwt_auth::define_header_extractor;
///
/// // Define a custom header extractor for "x-auth-token"
/// define_header_extractor!(XAuthToken, "x-auth-token");
///
/// // Now use it in your handlers:
/// // async fn handler(user: Claims<MyClaims, HeaderTokenExtractor<XAuthToken>>) -> Response { ... }
/// ```
#[macro_export]
macro_rules! define_header_extractor {
  ($name:ident, $header:expr) => {
    pub struct $name;
    impl $crate::ExtractorConfig for $name {
      fn value() -> &'static str {
        $header
      }
    }
  };
}

/// Creates a custom cookie token extractor with the given name and cookie value.
///
/// # Examples
///
/// ```
/// use axum_jwt_auth::define_cookie_extractor;
///
/// // Define a custom cookie extractor for "auth_token"
/// define_cookie_extractor!(AuthTokenCookie, "auth_token");
///
/// // Now use it in your handlers:
/// // async fn handler(user: Claims<MyClaims, CookieTokenExtractor<AuthTokenCookie>>) -> Response { ... }
/// ```
#[macro_export]
macro_rules! define_cookie_extractor {
  ($name:ident, $cookie:expr) => {
    pub struct $name;
    impl $crate::ExtractorConfig for $name {
      fn value() -> &'static str {
        $cookie
      }
    }
  };
}

/// Extracts JWT tokens from a custom HTTP header.
///
/// Use with the `define_header_extractor!` macro for convenience.
///
/// # Example
///
/// ```ignore
/// define_header_extractor!(XAuthToken, "x-auth-token");
///
/// async fn handler(user: Claims<MyClaims, HeaderTokenExtractor<XAuthToken>>) {
///     // Token extracted from the "x-auth-token" header
/// }
/// ```
pub struct HeaderTokenExtractor<C: ExtractorConfig>(PhantomData<C>);

impl<C: ExtractorConfig> TokenExtractor for HeaderTokenExtractor<C> {
  async fn extract_token(parts: &mut Parts) -> Result<String, AuthError> {
    let header_name = HeaderName::from_static(C::value());

    parts
      .headers
      .get(&header_name)
      .and_then(|h| h.to_str().ok())
      .map(|s| s.to_string())
      .ok_or(AuthError::MissingToken)
  }
}

/// Extracts JWT tokens from an HTTP cookie.
///
/// Use with the `define_cookie_extractor!` macro for convenience.
///
/// # Example
///
/// ```ignore
/// define_cookie_extractor!(AuthCookie, "auth_token");
///
/// async fn handler(user: Claims<MyClaims, CookieTokenExtractor<AuthCookie>>) {
///     // Token extracted from the "auth_token" cookie
/// }
/// ```
pub struct CookieTokenExtractor<C: ExtractorConfig>(PhantomData<C>);

impl<C: ExtractorConfig> TokenExtractor for CookieTokenExtractor<C> {
  async fn extract_token(parts: &mut Parts) -> Result<String, AuthError> {
    let cookies: TypedHeader<Cookie> = parts.extract().await.map_err(|_| AuthError::MissingToken)?;

    cookies.get(C::value()).map(|s| s.to_string()).ok_or(AuthError::MissingToken)
  }
}

impl<S, T, E> axum::extract::FromRequestParts<S> for Claims<T, E>
where
  Decoder<T>: FromRef<S>,
  S: Send + Sync,
  T: DeserializeOwned,
  E: TokenExtractor,
{
  type Rejection = AuthError;

  async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
    let token = E::extract_token(parts).await?;

    let decoder = Decoder::from_ref(state);
    let token_data = decoder.decode(&token).await.map_err(map_jwt_error)?;

    Ok(Claims {
      claims: token_data.claims,
      _extractor: PhantomData,
    })
  }
}

/// Maps JWT errors to AuthError
fn map_jwt_error(err: super::Error) -> AuthError {
  match err {
    super::Error::Jwt(e) => match e.kind() {
      ErrorKind::ExpiredSignature => AuthError::ExpiredSignature,
      ErrorKind::InvalidSignature => AuthError::InvalidSignature,
      ErrorKind::InvalidAudience => AuthError::InvalidAudience,
      ErrorKind::InvalidAlgorithm => AuthError::InvalidAlgorithm,
      ErrorKind::InvalidToken => AuthError::InvalidToken,
      ErrorKind::InvalidIssuer => AuthError::InvalidIssuer,
      ErrorKind::InvalidSubject => AuthError::InvalidSubject,
      ErrorKind::ImmatureSignature => AuthError::ImmatureSignature,
      ErrorKind::MissingAlgorithm => AuthError::MissingAlgorithm,
      ErrorKind::MissingRequiredClaim(claim) => AuthError::MissingRequiredClaim(claim.to_string()),
      _ => AuthError::InternalError,
    },
    _ => AuthError::InternalError,
  }
}

/// Authentication errors that can occur during JWT extraction and validation.
///
/// These errors are returned by the `Claims` extractor and mapped to appropriate HTTP responses.
#[derive(Debug, PartialEq, thiserror::Error)]
pub enum AuthError {
  /// The JWT token format is invalid or malformed.
  #[error("Invalid token")]
  InvalidToken,

  /// The JWT signature verification failed.
  #[error("Invalid signature")]
  InvalidSignature,

  /// A required JWT claim is missing from the token.
  #[error("Missing required claim: {0}")]
  MissingRequiredClaim(String),

  /// The token's `exp` claim indicates it has expired.
  #[error("Expired signature")]
  ExpiredSignature,

  /// The token's `iss` claim does not match the expected issuer.
  #[error("Invalid issuer")]
  InvalidIssuer,

  /// The token's `aud` claim does not match the expected audience.
  #[error("Invalid audience")]
  InvalidAudience,

  /// The token's `sub` claim does not match the expected subject.
  #[error("Invalid subject")]
  InvalidSubject,

  /// The token's `nbf` claim indicates it is not yet valid.
  #[error("Immature signature")]
  ImmatureSignature,

  /// The algorithm specified in the token header is not allowed.
  #[error("Invalid algorithm")]
  InvalidAlgorithm,

  /// No validation algorithms were configured.
  #[error("Missing algorithm")]
  MissingAlgorithm,

  /// No JWT token was found in the request.
  #[error("Missing token")]
  MissingToken,

  /// An unexpected internal error occurred (network, decoding, or cryptographic errors).
  #[error("Internal error")]
  InternalError,
}

impl IntoResponse for AuthError {
  fn into_response(self) -> Response {
    let (status, msg) = match self {
      AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token"),
      AuthError::InvalidSignature => (StatusCode::UNAUTHORIZED, "Invalid signature"),
      AuthError::MissingRequiredClaim(_) => (StatusCode::UNAUTHORIZED, "Missing required claim"),
      AuthError::ExpiredSignature => (StatusCode::UNAUTHORIZED, "Expired signature"),
      AuthError::InvalidIssuer => (StatusCode::UNAUTHORIZED, "Invalid issuer"),
      AuthError::InvalidAudience => (StatusCode::UNAUTHORIZED, "Invalid audience"),
      AuthError::InvalidSubject => (StatusCode::UNAUTHORIZED, "Invalid subject"),
      AuthError::ImmatureSignature => (StatusCode::UNAUTHORIZED, "Immature signature"),
      AuthError::InvalidAlgorithm => (StatusCode::UNAUTHORIZED, "Invalid algorithm"),
      AuthError::MissingAlgorithm => (StatusCode::UNAUTHORIZED, "Missing algorithm"),
      AuthError::MissingToken => (StatusCode::UNAUTHORIZED, "Missing token"),
      AuthError::InternalError => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error"),
    };

    (status, msg).into_response()
  }
}

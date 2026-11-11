use std::io;
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
  /// A configured or discovered URL does not parse.
  #[error("url parse failed")]
  UrlParse(#[from] url::ParseError),
  /// JSON serialization or deserialization failed.
  #[error("json failed")]
  SerdeJson(#[from] serde_json::Error),
  /// Time arithmetic or parsing failed.
  #[error("time failed")]
  Time(#[from] jiff::Error),
  /// A provider discovery, JWKS, or profile request failed.
  #[error(transparent)]
  Http(#[from] reqwest::Error),
  /// The provider returned an invalid or mismatched UserInfo response.
  #[error(transparent)]
  UserInfo(#[from] openidconnect::UserInfoError<reqwest::Error>),
  /// JWT decoder initialization failed.
  #[error(transparent)]
  Jwt(#[from] crate::JwtError),
  /// The API audience has not been configured.
  #[error("the Zitadel project ID must not be empty")]
  MissingAudience,
  /// Discovery returned a different issuer.
  #[error("the discovered issuer does not match the configured issuer")]
  IssuerMismatch,
  /// Discovery omitted the profile endpoint.
  #[error("the provider has no UserInfo endpoint")]
  MissingUserInfo,
  /// The profile does not belong to the bearer-token subject.
  #[error("the UserInfo subject does not match the access token")]
  SubjectMismatch,
  /// A required profile field was absent.
  #[error("the provider profile is missing {0}")]
  MissingProfile(&'static str),
}

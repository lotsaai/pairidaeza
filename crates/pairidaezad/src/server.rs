use std::{collections::BTreeMap, sync::Arc};

use axum::{
  Json, Router,
  extract::{FromRef, Path, State},
  http::StatusCode,
  response::{IntoResponse, Response},
  routing::{get, patch},
};
use axum_extra::{
  TypedHeader,
  headers::{Authorization, authorization::Bearer},
};
use jsonwebtoken::{Algorithm, Validation};
use openidconnect::core::{CoreProviderMetadata, CoreUserInfoClaims};
use protocol::{Bootstrap, Document, DocumentPatch, User};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::{Auth, Claims, Decoder, Error, RemoteJwksDecoder, RemoteJwksDecoderConfig, Result};

type Documents = BTreeMap<String, Document>;
type Owners = BTreeMap<(String, String), Documents>;

#[derive(Clone, Deserialize)]
struct AccessClaims {
  iss: String,
  sub: String,
}

#[derive(Clone)]
struct Api {
  decoder: Decoder<AccessClaims>,
  http: reqwest::Client,
  userinfo: String,
  fixtures: Arc<Documents>,
  owners: Arc<RwLock<Owners>>,
}

impl FromRef<Api> for Decoder<AccessClaims> {
  fn from_ref(state: &Api) -> Self {
    Arc::clone(&state.decoder)
  }
}

impl Api {
  async fn profile(&self, subject: &AccessClaims, token: &str) -> Result<User> {
    let response = self.http.get(&self.userinfo).bearer_auth(token).send().await?.error_for_status()?;
    let body = response.bytes().await?;
    let expected_subject = openidconnect::SubjectIdentifier::new(subject.sub.clone());
    let claims = CoreUserInfoClaims::from_json::<reqwest::Error>(&body, Some(&expected_subject))?;
    let email = claims
      .email()
      .map(|email| email.as_str().to_owned())
      .ok_or(Error::MissingProfile("email"))?;
    let username = claims.preferred_username().map(|name| name.as_str().to_owned());
    let name = claims
      .name()
      .and_then(|name| name.get(None))
      .map(|name| name.as_str().to_owned())
      .or_else(|| username.clone())
      .ok_or(Error::MissingProfile("name"))?;
    Ok(User {
      id: format!("{}|{}", subject.iss, subject.sub),
      name,
      email,
      email_verified: claims.email_verified().unwrap_or(false),
      picture: claims
        .picture()
        .and_then(|picture| picture.get(None))
        .map(|picture| picture.as_str().to_owned()),
      username,
      given_name: claims
        .given_name()
        .and_then(|name| name.get(None))
        .map(|name| name.as_str().to_owned()),
      family_name: claims
        .family_name()
        .and_then(|name| name.get(None))
        .map(|name| name.as_str().to_owned()),
      locale: claims.locale().map(ToString::to_string),
    })
  }

  async fn bootstrap(&self, subject: AccessClaims, token: &str) -> Result<Bootstrap> {
    let user = self.profile(&subject, token).await?;
    let mut owners = self.owners.write().await;
    let documents = owners.entry((subject.iss, subject.sub)).or_insert_with(|| (*self.fixtures).clone());
    if let Some(workspace) = documents.get_mut("workspace") {
      workspace
        .state
        .insert("account".into(), json!({"name": user.name, "email": user.email}));
    }
    Ok(Bootstrap {
      user,
      documents: documents.clone(),
    })
  }
}

impl IntoResponse for Error {
  fn into_response(self) -> Response {
    match self {
      Error::SubjectMismatch => (StatusCode::UNAUTHORIZED, "The provider profile does not match the access token").into_response(),
      error => {
        tracing::error!(error = %error, "API request failed");
        (StatusCode::BAD_GATEWAY, "The identity provider request failed").into_response()
      }
    }
  }
}

async fn bootstrap(
  State(api): State<Api>,
  Claims { claims, .. }: Claims<AccessClaims>,
  TypedHeader(bearer): TypedHeader<Authorization<Bearer>>,
) -> Result<Json<Bootstrap>> {
  Ok(Json(api.bootstrap(claims, bearer.token()).await?))
}

async fn profile(
  State(api): State<Api>,
  Claims { claims, .. }: Claims<AccessClaims>,
  TypedHeader(bearer): TypedHeader<Authorization<Bearer>>,
) -> Result<Json<User>> {
  Ok(Json(api.profile(&claims, bearer.token()).await?))
}

async fn update_document(
  State(api): State<Api>,
  Claims { claims, .. }: Claims<AccessClaims>,
  Path(namespace): Path<String>,
  Json(patch): Json<DocumentPatch>,
) -> Response {
  let mut owners = api.owners.write().await;
  let documents = owners.entry((claims.iss, claims.sub)).or_insert_with(|| (*api.fixtures).clone());
  let Some(document) = documents.get_mut(&namespace) else {
    return StatusCode::NOT_FOUND.into_response();
  };
  if patch
    .changes
    .keys()
    .any(|key| !document.state.contains_key(key) || (namespace == "workspace" && key == "account"))
  {
    return (StatusCode::BAD_REQUEST, "Unknown or read-only document field").into_response();
  }
  if document.revision != patch.revision {
    return (StatusCode::CONFLICT, Json(document.clone())).into_response();
  }
  if !patch.changes.is_empty() {
    let Some(revision) = document.revision.checked_add(1) else {
      return StatusCode::CONFLICT.into_response();
    };
    document.state.extend(patch.changes);
    document.revision = revision;
  }
  Json(document.clone()).into_response()
}

fn fixtures() -> Result<Documents> {
  let mut documents = BTreeMap::new();
  for (name, contents) in [
    ("workspace", include_str!("../fixtures/workspace.json")),
    ("memory", include_str!("../fixtures/memory.json")),
    ("models", include_str!("../fixtures/models.json")),
    ("templates", include_str!("../fixtures/templates.json")),
    ("usage", include_str!("../fixtures/usage.json")),
    ("vault", include_str!("../fixtures/vault.json")),
    ("voice", include_str!("../fixtures/voice.json")),
    ("approvals", include_str!("../fixtures/approvals.json")),
    ("computer", include_str!("../fixtures/computer.json")),
    ("integrations", include_str!("../fixtures/integrations.json")),
  ] {
    let state: Map<String, Value> = serde_json::from_str(contents)?;
    documents.insert(name.into(), Document { revision: 0, state });
  }
  Ok(documents)
}

fn access_token_validation(issuer: &str, audience: &str) -> Validation {
  let mut validation = Validation::new(Algorithm::RS256);
  validation.algorithms = vec![Algorithm::RS256, Algorithm::RS384, Algorithm::RS512];
  validation.set_issuer(&[issuer]);
  validation.set_audience(&[audience]);
  validation.set_required_spec_claims(&["iss", "sub", "aud", "exp"]);
  validation
}

/// Builds API routes with an initialized provider JWKS cache.
///
/// # Errors
/// Returns configuration, discovery, JWKS, or fixture parsing failures before serving requests.
pub async fn application(config: &Auth) -> Result<(Router, CancellationToken)> {
  if config.project_id.trim().is_empty() {
    return Err(Error::MissingAudience);
  }
  let http = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build()?;
  let metadata: CoreProviderMetadata = http
    .get(format!("{}/.well-known/openid-configuration", config.issuer.trim_end_matches('/')))
    .send()
    .await?
    .error_for_status()?
    .json()
    .await?;
  if metadata.issuer().as_str() != config.issuer {
    return Err(Error::IssuerMismatch);
  }
  let userinfo = metadata.userinfo_endpoint().ok_or(Error::MissingUserInfo)?.as_str().to_owned();
  let validation = access_token_validation(&config.issuer, &config.project_id);
  let decoder = RemoteJwksDecoder::builder()
    .jwks_url(metadata.jwks_uri().as_str().to_owned())
    .validation(validation)
    .config(
      RemoteJwksDecoderConfig::builder()
        .cache_duration(std::time::Duration::from_secs(config.jwks_refresh_seconds))
        .build(),
    )
    .build()?;
  let shutdown = decoder.initialize().await?;
  let api = Api {
    decoder: Arc::new(decoder),
    http,
    userinfo,
    fixtures: Arc::new(fixtures()?),
    owners: Arc::new(RwLock::new(BTreeMap::new())),
  };
  Ok((
    Router::new()
      .route("/healthz", get(|| async { "ok" }))
      .route("/api/user", get(profile))
      .route("/api/data/bootstrap", get(bootstrap))
      .route("/api/data/documents/{namespace}", patch(update_document))
      .route("/openapi.json", get(|| async { Json(protocol::openapi()) }))
      .with_state(api),
    shutdown,
  ))
}

#[cfg(test)]
mod tests;

use axum::{
  Router,
  body::{Body, Bytes},
  extract::{OriginalUri, Query, State},
  http::{HeaderMap, Method, StatusCode, header::CONTENT_TYPE},
  response::{Redirect, Response},
  routing::{get, patch, post},
};
use axum_login::{AuthManagerLayerBuilder, AuthSession};
use oauth2::{EndpointMaybeSet, EndpointNotSet, EndpointSet};
use openidconnect::{
  AuthenticationFlow, AuthorizationCode, ClientId, CsrfToken, EmptyAdditionalClaims, IssuerUrl, Nonce, OAuth2TokenResponse,
  PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope,
  core::{CoreClient, CoreGenderClaim, CoreProviderMetadata, CoreResponseType},
};
use serde::Deserialize;
use tower_sessions::{Expiry, Session as BrowserSession, SessionManagerLayer, cookie::SameSite};
use url::Url;
use uuid::Uuid;

use crate::{
  oauth_http, security,
  session_auth::{Backend, User},
  session_data::{Identity, SessionData},
};
use webui::{Config, PostgresStore};

pub(crate) type Client = CoreClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointMaybeSet, EndpointMaybeSet>;
type Session = AuthSession<Backend>;

#[derive(Clone)]
struct App {
  client: Client,
  http: reqwest::Client,
  data: SessionData,
  origin: Url,
  api: Url,
  project_id: String,
  native_client_id: String,
}

pub(crate) async fn router(config: &Config, pool: deadpool_postgres::Pool) -> eyre::Result<Router> {
  let origin = security::web_origin(&config.origin).ok_or_else(|| eyre::eyre!("invalid web origin"))?;
  let redirect = Url::parse(&config.auth.redirect_uri)?;
  if redirect.origin() != origin.origin()
    || !redirect.username().is_empty()
    || redirect.password().is_some()
    || redirect.path() != "/auth/zitadel/callback"
    || redirect.query().is_some()
    || redirect.fragment().is_some()
  {
    eyre::bail!("callback URI must match the web origin");
  }
  if config.auth.client_id.trim().is_empty() || config.auth.project_id.trim().is_empty() || config.auth.session_ttl_hours == 0 {
    eyre::bail!("OAuth client, audience and session lifetime are required");
  }
  let api = security::web_origin(&config.api_url).ok_or_else(|| eyre::eyre!("invalid API base URL"))?;
  let issuer = IssuerUrl::new(config.auth.issuer.clone())?;
  if issuer.url().scheme() != "https" {
    eyre::bail!("OIDC issuer must use HTTPS");
  }
  let http = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build()?;
  let adapter = {
    let client = http.clone();
    move |request| {
      let client = client.clone();
      async move { oauth_http::request(&client, request).await }
    }
  };
  let metadata = CoreProviderMetadata::discover_async(issuer, &adapter).await?;
  if metadata.token_endpoint().is_none() || metadata.userinfo_endpoint().is_none() {
    eyre::bail!("OIDC provider endpoints missing");
  }
  let client = CoreClient::from_provider_metadata(metadata, ClientId::new(config.auth.client_id.clone()), None)
    .set_redirect_uri(RedirectUrl::new(config.auth.redirect_uri.clone())?);
  let store = PostgresStore::<std::convert::Infallible>::new(pool.clone());
  store.migrate().await?;
  let data = SessionData::new(pool, config.auth.session_ttl_hours);
  let sessions = SessionManagerLayer::new(store)
    .with_http_only(true)
    .with_same_site(SameSite::Lax)
    .with_secure(origin.scheme() == "https")
    .with_expiry(Expiry::OnInactivity(time::Duration::hours(i64::from(
      config.auth.session_ttl_hours,
    ))));
  let layer = AuthManagerLayerBuilder::new(Backend(data.clone()), sessions).build();
  let app = App {
    client,
    http,
    data,
    origin,
    api,
    project_id: config.auth.project_id.clone(),
    native_client_id: config.auth.native_client_id.clone(),
  };
  Ok(
    Router::new()
      .route("/auth/begin", get(begin))
      .route("/auth/zitadel/callback", get(callback))
      .route("/auth/logout", post(logout))
      .route("/api/data/bootstrap", get(proxy))
      .route("/api/data/documents/{namespace}", patch(proxy))
      .with_state(app)
      .layer(layer),
  )
}

type HandlerResult<T> = Result<T, StatusCode>;

async fn begin(State(app): State<App>, session: BrowserSession) -> HandlerResult<Redirect> {
  let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
  let (url, state, nonce) = app
    .client
    .authorize_url(
      AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
      CsrfToken::new_random,
      Nonce::new_random,
    )
    .add_scope(Scope::new("profile".into()))
    .add_scope(Scope::new("email".into()))
    .add_scope(Scope::new("offline_access".into()))
    .add_scope(Scope::new(format!("urn:zitadel:iam:org:project:id:{}:aud", app.project_id)))
    .set_pkce_challenge(challenge)
    .url();
  session.insert("oidc_pending", true).await.map_err(internal)?;
  session.save().await.map_err(internal)?;
  let id = session.id().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?.to_string();
  app
    .data
    .insert_transaction(state.secret(), &id, verifier.secret(), nonce.secret())
    .await
    .map_err(internal)?;
  Ok(Redirect::to(url.as_str()))
}

#[derive(Deserialize)]
struct Callback {
  code: String,
  state: String,
}

async fn callback(
  State(app): State<App>,
  session: Session,
  browser_session: BrowserSession,
  Query(query): Query<Callback>,
) -> HandlerResult<Redirect> {
  let id = browser_session.id().ok_or(StatusCode::BAD_REQUEST)?.to_string();
  let transaction = app
    .data
    .consume_transaction(&query.state, &id)
    .await
    .map_err(internal)?
    .ok_or(StatusCode::BAD_REQUEST)?;
  let adapter = {
    let client = app.http.clone();
    move |request| {
      let client = client.clone();
      async move { oauth_http::request(&client, request).await }
    }
  };
  let token = app
    .client
    .exchange_code(AuthorizationCode::new(query.code))
    .map_err(internal)?
    .set_pkce_verifier(PkceCodeVerifier::new(transaction.verifier))
    .request_async(&adapter)
    .await
    .map_err(internal)?;
  let nonce = Nonce::new(transaction.nonce);
  let verifier = app
    .client
    .id_token_verifier()
    .set_other_audience_verifier_fn(|audience| audience.as_str() == app.project_id || audience.as_str() == app.native_client_id);
  let claims = token
    .extra_fields()
    .id_token()
    .ok_or(StatusCode::UNAUTHORIZED)?
    .claims(&verifier, &nonce)
    .map_err(|error| {
      tracing::warn!(%error, "ID token verification failed");
      StatusCode::UNAUTHORIZED
    })?;
  let subject = claims.subject().clone();
  let _info = app
    .client
    .user_info(token.access_token().clone(), Some(subject.clone()))
    .map_err(internal)?
    .request_async::<EmptyAdditionalClaims, _, CoreGenderClaim>(&adapter)
    .await
    .map_err(internal)?;
  let expires = token.expires_in().ok_or(StatusCode::BAD_GATEWAY)?;
  let expires_at = time::OffsetDateTime::now_utc()
    .unix_timestamp()
    .checked_add(i64::try_from(expires.as_secs()).map_err(internal)?)
    .ok_or(StatusCode::BAD_GATEWAY)?;
  let identity = Identity {
    id: Uuid::now_v7().to_string(),
    subject: subject.to_string(),
    auth_hash: CsrfToken::new_random().secret().clone(),
    access_token: token.access_token().secret().clone(),
    refresh_token: token.refresh_token().map(|token| token.secret().clone()),
    expires_at,
  };
  app.data.save_identity(&identity).await.map_err(internal)?;
  session.login(&User(identity)).await.map_err(internal)?;
  Ok(Redirect::to("/"))
}

async fn logout(State(app): State<App>, headers: HeaderMap, session: Session) -> HandlerResult<StatusCode> {
  if !security::mutation_allowed(&headers, &app.origin) {
    return Err(StatusCode::FORBIDDEN);
  }
  if let Some(user) = session.user().await {
    app.data.delete_identity(&user.0.id).await.map_err(internal)?;
  }
  session.logout().await.map_err(internal)?;
  Ok(StatusCode::NO_CONTENT)
}

async fn proxy(
  State(app): State<App>,
  session: Session,
  method: Method,
  OriginalUri(uri): OriginalUri,
  headers: HeaderMap,
  body: Bytes,
) -> HandlerResult<Response> {
  if method != Method::GET && !security::mutation_allowed(&headers, &app.origin) {
    return Err(StatusCode::FORBIDDEN);
  }
  let user = session.user().await.ok_or(StatusCode::UNAUTHORIZED)?;
  let token = app
    .data
    .access_token(&app.client, &app.http, &user.0.id)
    .await
    .map_err(internal)?
    .ok_or_else(|| {
      tracing::warn!("browser session has no usable access token");
      StatusCode::UNAUTHORIZED
    })?;
  let url = app
    .api
    .join(uri.path_and_query().map_or(uri.path(), |value| value.as_str()))
    .map_err(internal)?;
  let mut request = app.http.request(method, url).bearer_auth(token).body(body);
  if let Some(content_type) = headers.get(CONTENT_TYPE) {
    request = request.header(CONTENT_TYPE, content_type);
  }
  let response = request.send().await.map_err(internal)?;
  let status = response.status();
  if !status.is_success() {
    tracing::warn!(%status, "browser API proxy received an unsuccessful response");
  }
  let content_type = response.headers().get(CONTENT_TYPE).cloned();
  let body = response.bytes().await.map_err(internal)?;
  let mut result = Response::new(Body::from(body));
  *result.status_mut() = status;
  if let Some(content_type) = content_type {
    result.headers_mut().insert(CONTENT_TYPE, content_type);
  }
  Ok(result)
}

fn internal(error: impl std::fmt::Display) -> StatusCode {
  tracing::error!(error_type = std::any::type_name_of_val(&error), "browser request failed");
  StatusCode::INTERNAL_SERVER_ERROR
}

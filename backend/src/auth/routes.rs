//! The auth routes: begin (browser redirect for the web face, JSON for
//! native faces), the Zitadel callback, and the finish poll native faces
//! claim their token with.

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use serde::{Deserialize, Serialize};
use tower_sessions::Session;

use super::{AuthSession, AuthState, Begin, CallbackOutcome};

const WEB_STATE: &str = "oidc.state";

pub(crate) fn router(state: Arc<AuthState>) -> Router {
    Router::new()
        .route("/begin", get(begin_web).post(begin_native))
        .route("/session", get(session))
        .route("/zitadel/callback", get(callback))
        .route("/finish", post(finish))
        .with_state(state)
}

/// Reports whether the browser's session can open an RPC connection.
async fn session(
    State(auth): State<Arc<AuthState>>,
    auth_session: AuthSession,
    headers: HeaderMap,
) -> Response {
    let status = if !auth.enabled() || auth_session.user.is_some() {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::UNAUTHORIZED
    };
    let mut response = (status, [(header::CACHE_CONTROL, "no-store")]).into_response();
    if !auth.enabled()
        && let Some(origin) = headers.get(header::ORIGIN)
    {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
        response
            .headers_mut()
            .insert(header::VARY, header::HeaderValue::from_static("Origin"));
    }
    response
}

/// The web face navigates here; the redirect starts the login.
async fn begin_web(State(auth): State<Arc<AuthState>>, session: Session) -> Response {
    match auth.begin(true).await {
        Ok(begin) => match session.insert(WEB_STATE, &begin.state).await {
            Ok(()) => Redirect::to(&begin.authorize_url).into_response(),
            Err(error) => {
                tracing::warn!(%error, "failed to save login state");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(error) => error_response(error),
    }
}

/// Native clients open the returned URL and poll `finish`.
#[derive(Deserialize)]
struct BeginRequest {
    web: bool,
}

async fn begin_native(
    State(auth): State<Arc<AuthState>>,
    Json(request): Json<BeginRequest>,
) -> Response {
    if request.web {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match auth.begin(false).await {
        Ok(begin) => Json(BeginBody::from(begin)).into_response(),
        Err(error) => error_response(error),
    }
}

#[derive(Serialize)]
struct BeginBody {
    authorize_url: String,
    state: String,
}

impl From<Begin> for BeginBody {
    fn from(begin: Begin) -> Self {
        Self {
            authorize_url: begin.authorize_url,
            state: begin.state,
        }
    }
}

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

async fn callback(
    State(auth): State<Arc<AuthState>>,
    session: Session,
    mut auth_session: AuthSession,
    Query(query): Query<CallbackQuery>,
) -> Response {
    if let Some(error) = query.error {
        let description = query.error_description.unwrap_or_default();
        tracing::info!(%error, description, "login refused at zitadel");
        return (
            StatusCode::BAD_REQUEST,
            format!("login refused: {error} {description}"),
        )
            .into_response();
    }
    let (Some(code), Some(state)) = (query.code, query.state) else {
        return (StatusCode::BAD_REQUEST, "callback without code or state").into_response();
    };
    if auth.is_web(&state) {
        match session.remove::<String>(WEB_STATE).await {
            Ok(Some(expected)) if expected == state => {}
            Ok(_) => return StatusCode::BAD_REQUEST.into_response(),
            Err(error) => {
                tracing::warn!(%error, "failed to read login state");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        }
    }
    match auth.callback(code, state).await {
        Ok(CallbackOutcome::Web { user }) => match auth_session.login(&user).await {
            Ok(()) => Redirect::to("/").into_response(),
            Err(error) => {
                tracing::warn!(%error, "failed to establish browser session");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Ok(CallbackOutcome::Native) => {
            (StatusCode::OK, "Signed in. Return to Pairidaeza.").into_response()
        }
        Err(error) => error_response(error),
    }
}

#[derive(Deserialize)]
struct FinishRequest {
    state: String,
}

#[derive(Serialize)]
struct FinishResponse {
    token: String,
}

async fn finish(
    State(auth): State<Arc<AuthState>>,
    Json(request): Json<FinishRequest>,
) -> Response {
    match auth.finish(&request.state) {
        Ok(token) => Json(FinishResponse { token }).into_response(),
        Err(error) => error_response(error),
    }
}

fn error_response(error: crate::Error) -> Response {
    let status = match &error {
        crate::Error::AuthNotConfigured => StatusCode::SERVICE_UNAVAILABLE,
        crate::Error::UnknownAuthState => StatusCode::NOT_FOUND,
        _ => StatusCode::BAD_GATEWAY,
    };
    tracing::warn!(%error, "auth route failed");
    (status, error.to_string()).into_response()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::Body;
    use tower::ServiceExt as _;

    use super::*;

    /// Without a session key the auth surface refuses instead of pretending.
    #[tokio::test]
    async fn begin_refuses_without_a_session_key() {
        let app = router(Arc::new(
            AuthState::new(crate::config::Auth::test_default()),
        ));
        let request = axum::extract::Request::builder()
            .method("POST")
            .uri("/begin")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"web":false}"#))
            .expect("request");
        let response = app.oneshot(request).await.expect("infallible");
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn callback_rejects_state_from_another_browser() {
        use axum_login::AuthManagerLayerBuilder;
        use secrecy::SecretString;
        use tower_sessions::{Session, SessionManagerLayer};

        let mut config = crate::config::Auth::test_default();
        config.session_key = Some(SecretString::from("test-key"));
        let auth = Arc::new(AuthState::new(config));
        auth.pending.insert(
            "first-browser".to_owned(),
            super::super::Pending {
                nonce: String::new(),
                verifier: String::new(),
                claim: String::new(),
                web: true,
                created: std::time::Instant::now(),
                token: None,
            },
        );
        let dir = tempfile::tempdir().expect("dir");
        let store = crate::sessions::DbSessionStore::open(dir.path().join("sessions.sqlite"))
            .expect("storage");
        let other = Session::new(None, Arc::new(store.clone()), None);
        other
            .insert(WEB_STATE, "second-browser")
            .await
            .expect("state");
        other.save().await.expect("save");
        let id = other.id().expect("session id");
        let layer = SessionManagerLayer::new(store)
            .with_name("pairidaeza_session")
            .with_secure(false);
        let app = router(Arc::clone(&auth))
            .layer(AuthManagerLayerBuilder::new(crate::auth::Backend::new(auth), layer).build());
        let request = axum::extract::Request::builder()
            .uri("/zitadel/callback?code=unused&state=first-browser")
            .header("cookie", format!("pairidaeza_session={id}"))
            .body(Body::empty())
            .expect("request");
        let response = app.oneshot(request).await.expect("response");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}

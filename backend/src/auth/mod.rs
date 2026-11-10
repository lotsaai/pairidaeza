//! Server-mediated Zitadel login for native and browser clients.
//!
//! Browser OAuth state is bound to a server-side session. Native clients
//! receive a signed bearer token using a separate finish-poll secret.
//! Zitadel tokens stay on the server.
//!
//! No session key, no auth: the routes answer 503 and upgrades go through
//! unchecked, which is development without Zitadel. Production sets
//! `PAIRIDAEZA_AUTH__SESSION_KEY`; [`AuthState::enabled`] is the one place that
//! reads the difference.

mod backend;
mod routes;
mod session;
mod zitadel;

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum_login::AuthnBackend as _;
use dashmap::DashMap;
use secrecy::SecretString;
use serde::Serialize;
use uuid::Uuid;

use crate::config::Auth;
use crate::{Error, Result};

pub(crate) use backend::{AuthBackend as Backend, PairidaezaAuthSession as AuthSession};
pub(crate) use routes::router;
pub(crate) use session::{SessionUser, mint};

/// How long a login in flight stays claimable.
const PENDING_TTL: Duration = Duration::from_secs(600);

/// A login in flight: created by `begin`, completed by the Zitadel callback,
/// claimed by `finish` (native faces) or answered with a cookie (web).
struct Pending {
    nonce: String,
    verifier: String,
    claim: String,
    /// True when `begin` was the browser-redirect route: the callback answers
    /// with a cookie and a redirect instead of holding the token for `finish`.
    web: bool,
    created: Instant,
    /// The minted session token, from the callback until `finish` claims it.
    token: Option<String>,
}

/// Extracts a native client's bearer token.
pub(crate) fn session_token(request: &axum::extract::Request) -> Option<&str> {
    if let Some(token) = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
    {
        return Some(token);
    }
    None
}

/// What `begin` gives a native face: the URL to open and the state to poll.
#[derive(Serialize)]
pub(crate) struct Begin {
    pub(crate) authorize_url: String,
    pub(crate) state: String,
}

/// How the callback answers: a cookie and a redirect for the web face, a
/// held token for a native face's `finish` poll.
pub(crate) enum CallbackOutcome {
    Web { user: SessionUser },
    Native,
}

/// The identity surface: config, the Zitadel client, and the logins in
/// flight.
pub(crate) struct AuthState {
    config: Auth,
    zitadel: zitadel::Zitadel,
    pending: DashMap<String, Pending>,
}

impl AuthState {
    pub(crate) fn issuer(&self) -> &str {
        &self.config.issuer
    }

    pub(crate) fn new(config: Auth) -> Self {
        let zitadel = zitadel::Zitadel::new(&config);
        Self {
            config,
            zitadel,
            pending: DashMap::new(),
        }
    }

    /// Whether identity is configured: without a session key there are no
    /// tokens to mint, so the auth surface refuses and upgrades skip the
    /// check.
    pub(crate) fn enabled(&self) -> bool {
        self.config.session_key.is_some()
    }

    /// Verifies a presented session token.
    pub(crate) fn verify(&self, token: &str) -> Result<SessionUser> {
        session::verify(self.key()?, token)
    }

    /// Whether the session cookie carries `Secure`: derived from the callback
    /// URL's scheme, not a knob.
    pub(crate) fn cookie_secure(&self) -> bool {
        self.config.redirect_uri.starts_with("https://")
    }

    pub(crate) fn same_origin(&self, request: &axum::extract::Request) -> bool {
        let Some(origin) = request
            .headers()
            .get(axum::http::header::ORIGIN)
            .and_then(|value| value.to_str().ok())
        else {
            return false;
        };
        match (
            url::Url::parse(origin),
            url::Url::parse(&self.config.redirect_uri),
        ) {
            (Ok(origin), Ok(redirect)) => origin.origin() == redirect.origin(),
            _ => false,
        }
    }

    fn key(&self) -> Result<&SecretString> {
        self.config
            .session_key
            .as_ref()
            .ok_or(Error::AuthNotConfigured)
    }

    /// Starts a login: the authorize URL to open and the state id that keys
    /// it.
    ///
    /// # Errors
    ///
    /// [`Error::AuthNotConfigured`] without a session key, Zitadel errors when
    /// discovery fails.
    pub(crate) async fn begin(&self, web: bool) -> Result<Begin> {
        self.sweep();
        self.key()?;
        let state = base64::Engine::encode(
            &base64::prelude::BASE64_URL_SAFE_NO_PAD,
            rand::random::<[u8; 32]>(),
        );
        let nonce = Uuid::now_v7().to_string();
        let claim = base64::Engine::encode(
            &base64::prelude::BASE64_URL_SAFE_NO_PAD,
            rand::random::<[u8; 32]>(),
        );
        let (verifier, challenge) = zitadel::pkce();
        let authorize_url = self
            .zitadel
            .authorize_url(&state, &nonce, &challenge)
            .await?;
        self.pending.insert(
            state.clone(),
            Pending {
                nonce,
                verifier,
                claim: claim.clone(),
                web,
                created: Instant::now(),
                token: None,
            },
        );
        Ok(Begin {
            authorize_url,
            state: if web { state } else { claim },
        })
    }

    fn is_web(&self, state: &str) -> bool {
        self.pending.get(state).is_some_and(|pending| pending.web)
    }

    /// Completes a login: exchanges the code, validates the id_token, mints
    /// the session token.
    ///
    /// # Errors
    ///
    /// [`Error::UnknownAuthState`] for a state that is not pending, Zitadel
    /// and id_token errors from the exchange and validation.
    pub(crate) async fn callback(
        self: &Arc<Self>,
        code: String,
        state: String,
    ) -> Result<CallbackOutcome> {
        let (nonce, verifier, web) = {
            let Some(pending) = self.pending.get(&state) else {
                return Err(Error::UnknownAuthState);
            };
            if pending.created.elapsed() >= PENDING_TTL {
                return Err(Error::UnknownAuthState);
            }
            (pending.nonce.clone(), pending.verifier.clone(), pending.web)
        };
        let user = Backend::new(Arc::clone(self))
            .authenticate(backend::OidcCredentials {
                code,
                nonce,
                verifier,
            })
            .await?
            .ok_or(Error::UnknownAuthState)?;
        if web {
            self.pending.remove(&state);
            return Ok(CallbackOutcome::Web { user });
        }
        let ttl = jiff::Span::new().hours(i64::from(self.config.session_ttl_hours));
        let token = mint(self.key()?, &user, ttl)?;
        let Some(mut pending) = self.pending.get_mut(&state) else {
            return Err(Error::UnknownAuthState);
        };
        pending.token = Some(token);
        Ok(CallbackOutcome::Native)
    }

    /// Claims the session token a native face's login produced. One claim
    /// per state: the login is consumed with its token, and only once the
    /// callback has minted it — a poll that consumed an unfinished login
    /// would strand the callback, which would find nowhere to store its
    /// token.
    ///
    /// # Errors
    ///
    /// [`Error::UnknownAuthState`] when the state is unknown, expired, or
    /// its callback has not completed.
    pub(crate) fn finish(&self, state: &str) -> Result<String> {
        let key = self
            .pending
            .iter()
            .find(|pending| {
                !pending.web && pending.claim == state && pending.created.elapsed() < PENDING_TTL
            })
            .map(|pending| pending.key().clone())
            .ok_or(Error::UnknownAuthState)?;
        let token = {
            let Some(mut pending) = self.pending.get_mut(&key) else {
                return Err(Error::UnknownAuthState);
            };
            pending.token.take()
        };
        match token {
            Some(token) => {
                self.pending.remove(&key);
                Ok(token)
            }
            None => Err(Error::UnknownAuthState),
        }
    }

    fn sweep(&self) {
        self.pending
            .retain(|_, pending| pending.created.elapsed() < PENDING_TTL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pending native login under `state`, unfinished.
    fn auth_with_pending(state: &str) -> AuthState {
        let mut config = crate::config::Auth::test_default();
        config.session_key = Some(SecretString::from("test-key"));
        let auth = AuthState::new(config);
        auth.pending.insert(
            state.to_owned(),
            Pending {
                nonce: String::new(),
                verifier: String::new(),
                claim: state.to_owned(),
                web: false,
                created: Instant::now(),
                token: None,
            },
        );
        auth
    }

    /// A finish poll before the callback lands must not consume the login:
    /// the desktop polls from the first second, and the browser login takes
    /// longer than that. The callback still has to find its entry to store
    /// the token under.
    #[test]
    fn finish_before_the_callback_keeps_the_login() {
        let auth = auth_with_pending("s");
        assert!(matches!(auth.finish("s"), Err(Error::UnknownAuthState)));
        assert!(auth.pending.get("s").is_some());
    }

    /// After the callback stores the token, one finish claims it and the
    /// login is gone; a second claim is unknown.
    #[test]
    fn finish_claims_the_token_once() {
        let auth = auth_with_pending("s");
        auth.pending
            .get_mut("s")
            .expect("pending")
            .value_mut()
            .token = Some("token".to_owned());
        assert_eq!(auth.finish("s").expect("token"), "token");
        assert!(auth.pending.get("s").is_none());
        assert!(matches!(auth.finish("s"), Err(Error::UnknownAuthState)));
    }

    #[test]
    fn oauth_state_cannot_claim_native_token() {
        let auth = auth_with_pending("oauth-state");
        let mut pending = auth.pending.get_mut("oauth-state").expect("pending");
        pending.claim = "private-claim".to_owned();
        pending.token = Some("token".to_owned());
        drop(pending);
        assert!(matches!(
            auth.finish("oauth-state"),
            Err(Error::UnknownAuthState)
        ));
        assert_eq!(
            auth.finish("private-claim").expect("private claim"),
            "token"
        );
    }
}

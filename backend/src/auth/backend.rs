//! Axum login backend for identities verified by Zitadel.

use std::fmt;
use std::sync::Arc;

use axum_login::{AuthUser, AuthnBackend, UserId};
use serde::{Deserialize, Serialize};

use super::AuthState;
use super::session::SessionUser;

/// The identity an axum-login session stores: enough to rebuild a
/// [`SessionUser`] with no database, nothing more.
///
/// Its `Display` is the `sub` alone, which is what axum-login puts in trace
/// spans; the email stays out of them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct SessionIdentity {
    pub(crate) sub: String,
    pub(crate) email: String,
}

impl fmt::Display for SessionIdentity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { sub, .. } = self;
        write!(f, "{sub}")
    }
}

impl AuthUser for SessionUser {
    type Id = SessionIdentity;

    fn id(&self) -> Self::Id {
        let Self { sub, email } = self;
        SessionIdentity {
            sub: sub.clone(),
            email: email.clone(),
        }
    }

    fn session_auth_hash(&self) -> &[u8] {
        let Self { sub, .. } = self;
        sub.as_bytes()
    }
}

/// The OIDC material one login presents: the code Zitadel returned, plus the
/// nonce and PKCE verifier this server started that login with.
///
/// `Debug` is hand-written and redacts everything: a code, verifier, or nonce in
/// a log line is a login someone else can finish.
#[derive(Clone)]
pub(crate) struct OidcCredentials {
    pub(super) code: String,
    pub(super) nonce: String,
    pub(super) verifier: String,
}

impl fmt::Debug for OidcCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("OidcCredentials").finish_non_exhaustive()
    }
}

/// The identity backend: the code exchange and id_token validation, reached
/// through the shared auth state.
#[derive(Clone)]
pub(crate) struct AuthBackend {
    auth: Arc<AuthState>,
}

impl fmt::Debug for AuthBackend {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthBackend").finish_non_exhaustive()
    }
}

impl AuthBackend {
    pub(crate) fn new(auth: Arc<AuthState>) -> Self {
        Self { auth }
    }
}

/// The session type handlers extract and `login_required!` guards with.
pub(crate) type PairidaezaAuthSession = axum_login::AuthSession<AuthBackend>;

impl AuthnBackend for AuthBackend {
    type User = SessionUser;
    type Credentials = OidcCredentials;
    type Error = crate::Error;

    async fn authenticate(
        &self,
        creds: Self::Credentials,
    ) -> Result<Option<Self::User>, Self::Error> {
        let OidcCredentials {
            code,
            nonce,
            verifier,
        } = creds;
        let zitadel = &self.auth.zitadel;
        let id_token = zitadel.exchange_code(&code, &verifier).await?;
        let claims = zitadel.verify_id_token(&id_token, &nonce).await?;
        let user = SessionUser {
            sub: claims.sub,
            email: claims.email,
        };
        Ok(Some(user))
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<Self::User>, Self::Error> {
        let SessionIdentity { sub, email } = user_id;
        Ok(Some(SessionUser {
            sub: sub.clone(),
            email: email.clone(),
        }))
    }
}

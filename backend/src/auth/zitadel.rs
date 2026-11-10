//! The Zitadel half of identity: OIDC discovery, the authorize URL with the
//! project audience scope, the code exchange, and id_token validation
//! against the instance's JWKS.

use std::sync::{PoisonError, RwLock};
use std::time::{Duration, Instant};

use base64::Engine as _;
use base64::prelude::BASE64_URL_SAFE_NO_PAD;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use sha2::{Digest as _, Sha256};

use crate::config::Auth;
use crate::{Error, Result};

/// The OpenID discovery document, narrowed to what this server uses.
#[derive(Clone, Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
}

/// The claims heyday reads off a validated id_token.
pub(crate) struct IdClaims {
    pub(crate) sub: String,
    pub(crate) email: String,
}

/// A fresh PKCE pair: a 32-byte verifier and its S256 challenge (RFC 7636).
pub(crate) fn pkce() -> (String, String) {
    let verifier = BASE64_URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let challenge = BASE64_URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// The instance's endpoints and signing keys, fetched lazily and cached.
pub(crate) struct Zitadel {
    issuer: String,
    client_id: String,
    project_id: String,
    redirect_uri: String,
    leeway: u64,
    refresh: Duration,
    http: reqwest::Client,
    discovery: RwLock<Option<Discovery>>,
    jwks: RwLock<Option<(Instant, JwkSet)>>,
}

impl Zitadel {
    pub(crate) fn new(config: &Auth) -> Self {
        Self {
            issuer: config.issuer.clone(),
            client_id: config.client_id.clone(),
            project_id: config.project_id.clone(),
            redirect_uri: config.redirect_uri.clone(),
            leeway: config.leeway_seconds,
            refresh: Duration::from_secs(config.jwks_refresh_seconds),
            http: reqwest::Client::new(),
            discovery: RwLock::new(None),
            jwks: RwLock::new(None),
        }
    }

    /// The authorize URL for one login: PKCE challenge, CSRF state, nonce, and
    /// the Zitadel project audience scope that makes the instance return JWT
    /// access tokens (the sctl flow).
    ///
    /// # Errors
    ///
    /// Zitadel discovery or URL failures as typed variants.
    pub(crate) async fn authorize_url(
        &self,
        state: &str,
        nonce: &str,
        challenge: &str,
    ) -> Result<String> {
        let discovery = self.discovery().await?;
        let scope = format!(
            "openid email profile urn:zitadel:iam:org:project:id:{}:aud",
            self.project_id
        );
        let url = url::Url::parse_with_params(
            &discovery.authorization_endpoint,
            [
                ("response_type", "code"),
                ("client_id", self.client_id.as_str()),
                ("redirect_uri", self.redirect_uri.as_str()),
                ("scope", scope.as_str()),
                ("state", state),
                ("nonce", nonce),
                ("code_challenge", challenge),
                ("code_challenge_method", "S256"),
            ],
        )?;
        Ok(url.to_string())
    }

    /// Exchanges the authorization code for the id_token. The client is
    /// public: PKCE, no secret.
    ///
    /// # Errors
    ///
    /// Transport failures, [`Error::CodeExchange`] when Zitadel refuses the
    /// code, [`Error::IdTokenMissing`] when the response carries no id_token.
    pub(crate) async fn exchange_code(&self, code: &str, verifier: &str) -> Result<String> {
        let discovery = self.discovery().await?;
        let response = self
            .http
            .post(&discovery.token_endpoint)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", self.redirect_uri.as_str()),
                ("client_id", self.client_id.as_str()),
                ("code_verifier", verifier),
            ])
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            tracing::warn!(%status, body, "zitadel token exchange failed");
            return Err(Error::CodeExchange {
                status: status.as_u16(),
            });
        }
        #[derive(Deserialize)]
        struct TokenResponse {
            id_token: Option<String>,
        }
        let tokens: TokenResponse = serde_json::from_str(&body)?;
        tokens.id_token.ok_or(Error::IdTokenMissing)
    }

    /// Validates the id_token: signature from the instance's JWKS, issuer,
    /// audience, expiry with leeway, an allowed algorithm, and the nonce this
    /// login started with.
    ///
    /// # Errors
    ///
    /// Typed variants per failed check; none of them echo the token.
    pub(crate) async fn verify_id_token(&self, id_token: &str, nonce: &str) -> Result<IdClaims> {
        let header = decode_header(id_token)?;
        if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) {
            return Err(Error::IdTokenAlgorithm);
        }
        let kid = header.kid.ok_or(Error::IdTokenMissingKid)?;
        let key = self.decoding_key(&kid).await?;
        let mut validation = Validation::new(header.alg);
        validation.set_issuer(&[&self.issuer]);
        validation.set_audience(&[&self.client_id, &self.project_id]);
        validation.leeway = self.leeway;
        #[derive(Deserialize)]
        struct Claims {
            sub: String,
            email: Option<String>,
            nonce: Option<String>,
        }
        let token = decode::<Claims>(id_token, &key, &validation)?;
        if token.claims.nonce.as_deref() != Some(nonce) {
            return Err(Error::IdTokenNonce);
        }
        Ok(IdClaims {
            sub: token.claims.sub,
            email: token.claims.email.ok_or(Error::IdTokenMissingEmail)?,
        })
    }

    async fn discovery(&self) -> Result<Discovery> {
        if let Some(discovery) = self
            .discovery
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
        {
            return Ok(discovery);
        }
        let url = format!(
            "{}/.well-known/openid-configuration",
            self.issuer.trim_end_matches('/')
        );
        let fetched: Discovery = self
            .http
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        *self
            .discovery
            .write()
            .unwrap_or_else(PoisonError::into_inner) = Some(fetched.clone());
        Ok(fetched)
    }

    async fn decoding_key(&self, kid: &str) -> Result<DecodingKey> {
        if let Some(key) = self.cached_key(kid)? {
            return Ok(key);
        }
        // Unknown key or stale cache: refetch once, then trust the answer.
        let discovery = self.discovery().await?;
        let set: JwkSet = self
            .http
            .get(&discovery.jwks_uri)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        *self.jwks.write().unwrap_or_else(PoisonError::into_inner) = Some((Instant::now(), set));
        self.cached_key(kid)?.ok_or(Error::UnknownSigningKey)
    }

    fn cached_key(&self, kid: &str) -> Result<Option<DecodingKey>> {
        let guard = self.jwks.read().unwrap_or_else(PoisonError::into_inner);
        let Some((fetched, set)) = guard.as_ref() else {
            return Ok(None);
        };
        if fetched.elapsed() > self.refresh {
            return Ok(None);
        }
        let Some(jwk) = set
            .keys
            .iter()
            .find(|key| key.common.key_id.as_deref() == Some(kid))
        else {
            return Ok(None);
        };
        DecodingKey::from_jwk(jwk).map(Some).map_err(Error::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_pair_is_valid_rfc7636() {
        let (verifier, challenge) = pkce();
        // 32 bytes encode to 43 characters; the challenge is the SHA-256 of the
        // verifier's ASCII, base64url without padding.
        assert_eq!(verifier.len(), 43, "{verifier}");
        let expected = BASE64_URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, expected);
    }
}

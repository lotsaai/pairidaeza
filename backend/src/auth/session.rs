//! Heyday session tokens: `pairidaeza_v1.<payload>.<signature>`, HMAC-SHA256
//! over the prefix and the payload (the kinderini JIT shape). The payload is
//! JSON with the Zitadel `sub`, the email, and an RFC 3339 expiry.

use base64::Engine as _;
use base64::prelude::BASE64_URL_SAFE_NO_PAD;
use hmac::{Hmac, Mac};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::{Error, Result};

const PREFIX: &str = "pairidaeza_v1";

type HmacSha256 = Hmac<Sha256>;

/// Who a verified session token says is calling.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SessionUser {
    /// The Zitadel user id; the omp profile name derives from it.
    pub(crate) sub: String,
    pub(crate) email: String,
}

#[derive(Serialize, Deserialize)]
struct Payload {
    sub: String,
    email: String,
    /// RFC 3339 expiry.
    exp: String,
}

/// Signs a session token for `user`, valid for `ttl`.
///
/// # Errors
///
/// Key, serialization, and time failures as typed variants.
pub(crate) fn mint(key: &SecretString, user: &SessionUser, ttl: jiff::Span) -> Result<String> {
    let exp = jiff::Timestamp::now().checked_add(ttl)?;
    let payload = Payload {
        sub: user.sub.clone(),
        email: user.email.clone(),
        exp: exp.to_string(),
    };
    let encoded = BASE64_URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload)?);
    let head = format!("{PREFIX}.{encoded}");
    let signature = sign(key, head.as_bytes())?;
    Ok(format!(
        "{head}.{}",
        BASE64_URL_SAFE_NO_PAD.encode(signature)
    ))
}

/// Verifies a session token: prefix, constant-time signature, expiry.
///
/// # Errors
///
/// [`Error::InvalidSessionToken`] for any failure; the reason is logged, not
/// echoed to the presenter.
pub(crate) fn verify(key: &SecretString, token: &str) -> Result<SessionUser> {
    let (head, signature) = token.rsplit_once('.').ok_or(Error::InvalidSessionToken)?;
    if !head.starts_with(&format!("{PREFIX}.")) {
        return Err(Error::InvalidSessionToken);
    }
    let given = BASE64_URL_SAFE_NO_PAD
        .decode(signature.as_bytes())
        .map_err(|_| Error::InvalidSessionToken)?;
    let mut mac = HmacSha256::new_from_slice(key.expose_secret().as_bytes())
        .map_err(|_| Error::BadSessionKey)?;
    mac.update(head.as_bytes());
    mac.verify_slice(&given)
        .map_err(|_| Error::InvalidSessionToken)?;
    let encoded = head
        .strip_prefix(&format!("{PREFIX}."))
        .ok_or(Error::InvalidSessionToken)?;
    let decoded = BASE64_URL_SAFE_NO_PAD
        .decode(encoded.as_bytes())
        .map_err(|_| Error::InvalidSessionToken)?;
    let payload: Payload = serde_json::from_slice(&decoded)?;
    let exp: jiff::Timestamp = payload
        .exp
        .parse()
        .map_err(|_| Error::InvalidSessionToken)?;
    if exp <= jiff::Timestamp::now() {
        tracing::debug!(sub = %payload.sub, "session token expired");
        return Err(Error::InvalidSessionToken);
    }
    Ok(SessionUser {
        sub: payload.sub,
        email: payload.email,
    })
}

fn sign(key: &SecretString, message: &[u8]) -> Result<Vec<u8>> {
    let mut mac = HmacSha256::new_from_slice(key.expose_secret().as_bytes())
        .map_err(|_| Error::BadSessionKey)?;
    mac.update(message);
    Ok(mac.finalize().into_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> SecretString {
        SecretString::from("test-session-key".to_owned())
    }

    fn user() -> SessionUser {
        SessionUser {
            sub: "236613969884545156".to_owned(),
            email: "ivan@lotsa.ai".to_owned(),
        }
    }

    #[test]
    fn mint_verify_round_trip() {
        let token = mint(&key(), &user(), jiff::Span::new().hours(1)).expect("mint");
        assert!(token.starts_with("pairidaeza_v1."), "{token}");
        assert_eq!(verify(&key(), &token).expect("verify"), user());
    }

    #[test]
    fn rejects_a_wrong_key() {
        let token = mint(&key(), &user(), jiff::Span::new().hours(1)).expect("mint");
        let other = SecretString::from("another-key".to_owned());
        assert!(matches!(
            verify(&other, &token),
            Err(Error::InvalidSessionToken)
        ));
    }

    #[test]
    fn rejects_a_tampered_token() {
        let token = mint(&key(), &user(), jiff::Span::new().hours(1)).expect("mint");
        let tampered = format!("{token}x");
        assert!(verify(&key(), &tampered).is_err());
        assert!(verify(&key(), "garbage").is_err());
        assert!(verify(&key(), "pairidaeza_v1.nopayload").is_err());
    }

    #[test]
    fn rejects_an_expired_token() {
        let token = mint(&key(), &user(), jiff::Span::new().hours(-1)).expect("mint");
        assert!(matches!(
            verify(&key(), &token),
            Err(Error::InvalidSessionToken)
        ));
    }
}

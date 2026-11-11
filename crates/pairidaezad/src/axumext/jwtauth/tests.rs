use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, encode};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{Claims, Decoder, LocalDecoder};

const SIGNING_KEY: &[u8] = b"test-only-signing-key-not-used-in-production";
const ISSUER: &str = "https://issuer.test";
const AUDIENCE: &str = "pairidaeza-api";

fn claims() -> Value {
  let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
  json!({"sub": "user-123", "iss": ISSUER, "aud": AUDIENCE, "exp": now + 3600})
}

fn token(claims: &Value, key: &[u8]) -> String {
  encode(&Header::new(Algorithm::HS256), claims, &EncodingKey::from_secret(key)).unwrap()
}

async fn request(token: Option<String>) -> Response {
  let mut validation = Validation::new(Algorithm::HS256);
  validation.set_issuer(&[ISSUER]);
  validation.set_audience(&[AUDIENCE]);
  validation.leeway = 0;
  let decoder: Decoder<Value> = Arc::new(LocalDecoder::new(vec![DecodingKey::from_secret(SIGNING_KEY)], validation).unwrap());
  let app = Router::new()
    .route("/private", get(|user: Claims<Value>| async move { Json(user.claims) }))
    .with_state(decoder);
  let mut request = Request::builder().uri("/private");
  if let Some(token) = token {
    request = request.header("authorization", format!("Bearer {token}"));
  }
  app.oneshot(request.body(Body::empty()).unwrap()).await.unwrap()
}

#[tokio::test]
async fn verified_token_returns_authenticated_subject() {
  let response = request(Some(token(&claims(), SIGNING_KEY))).await;
  assert_eq!(response.status(), StatusCode::OK);
  let body = response.into_body().collect().await.unwrap().to_bytes();
  let claims: Value = serde_json::from_slice(&body).unwrap();
  assert_eq!(claims["sub"], "user-123");
}

#[tokio::test]
async fn missing_bearer_token_is_unauthorized() {
  assert_eq!(request(None).await.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn forged_signature_is_unauthorized() {
  let forged = token(&claims(), b"different-test-only-signing-key");
  assert_eq!(request(Some(forged)).await.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn wrong_issuer_is_unauthorized() {
  let mut claims = claims();
  claims["iss"] = json!("https://other-issuer.test");
  assert_eq!(request(Some(token(&claims, SIGNING_KEY))).await.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn wrong_audience_is_unauthorized() {
  let mut claims = claims();
  claims["aud"] = json!("other-api");
  assert_eq!(request(Some(token(&claims, SIGNING_KEY))).await.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn expired_token_is_unauthorized() {
  let mut claims = claims();
  claims["exp"] = json!(1);
  assert_eq!(request(Some(token(&claims, SIGNING_KEY))).await.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn unapproved_algorithm_is_unauthorized() {
  let token = encode(&Header::new(Algorithm::HS384), &claims(), &EncodingKey::from_secret(SIGNING_KEY)).unwrap();
  assert_eq!(request(Some(token)).await.status(), StatusCode::UNAUTHORIZED);
}

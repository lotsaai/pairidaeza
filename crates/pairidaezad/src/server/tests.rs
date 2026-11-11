use super::*;
use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, encode};
use tower::ServiceExt;

const KEY: &[u8] = b"isolated-api-test-signing-key";
const ISSUER: &str = "https://issuer.test";
const AUDIENCE: &str = "pairidaeza-api";

#[test]
fn rsa_signature_is_verified_with_api_algorithm_policy() {
  // RFC 7515 Appendix A.2 uses an expired token without audience or subject.
  let token = concat!(
    "eyJhbGciOiJSUzI1NiJ9.",
    "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFt",
    "cGxlLmNvbS9pc19yb290Ijp0cnVlfQ.",
    "cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7",
    "AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4",
    "BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K",
    "0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqv",
    "hJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrB",
    "p0igcN_IoypGlUPQGe77Rw"
  );
  let modulus = concat!(
    "ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddx",
    "HmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMs",
    "D1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSH",
    "SXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdV",
    "MTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8",
    "NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ"
  );
  let key = DecodingKey::from_rsa_components(modulus, "AQAB").unwrap();
  let mut validation = access_token_validation("joe", AUDIENCE);
  validation.set_required_spec_claims(&["iss", "exp"]);
  validation.validate_aud = false;
  validation.validate_exp = false;
  let claims = jsonwebtoken::decode::<Value>(token, &key, &validation).unwrap().claims;
  assert_eq!(claims["iss"], "joe");
  validation.validate_exp = true;
  assert!(matches!(
    jsonwebtoken::decode::<Value>(token, &key, &validation).unwrap_err().kind(),
    jsonwebtoken::errors::ErrorKind::ExpiredSignature
  ));
  let forged = token.replace("eyJpc3MiOiJqb2Ui", "eyJpc3MiOiJqb2Vi");
  assert!(jsonwebtoken::decode::<Value>(&forged, &key, &validation).is_err());
  let hmac = encode(
    &Header::new(Algorithm::HS256),
    &json!({"iss": "joe"}),
    &EncodingKey::from_secret(KEY),
  )
  .unwrap();
  assert!(matches!(
    jsonwebtoken::decode::<Value>(&hmac, &DecodingKey::from_secret(KEY), &validation)
      .unwrap_err()
      .kind(),
    jsonwebtoken::errors::ErrorKind::InvalidAlgorithm
  ));
}

fn app() -> Router {
  let mut validation = Validation::new(Algorithm::HS256);
  validation.set_issuer(&[ISSUER]);
  validation.set_audience(&[AUDIENCE]);
  validation.set_required_spec_claims(&["iss", "sub", "aud", "exp"]);
  let decoder = crate::LocalDecoder::new(vec![DecodingKey::from_secret(KEY)], validation).unwrap();
  let state = Api {
    decoder: Arc::new(decoder),
    http: reqwest::Client::new(),
    userinfo: "https://auth.lotsa.ai/oidc/v1/userinfo".into(),
    fixtures: Arc::new(fixtures().unwrap()),
    owners: Arc::new(RwLock::new(BTreeMap::new())),
  };
  Router::new()
    .route("/api/data/bootstrap", get(bootstrap))
    .route("/api/data/documents/{namespace}", patch(update_document))
    .with_state(state)
}

fn token(subject: &str, key: &[u8]) -> String {
  let expiry = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs()
    + 300;
  encode(
    &Header::new(Algorithm::HS256),
    &json!({"iss": ISSUER, "sub": subject, "aud": AUDIENCE, "exp": expiry}),
    &EncodingKey::from_secret(key),
  )
  .unwrap()
}

async fn update(app: &Router, subject: &str, revision: u64, changes: Value) -> Response {
  let request = Request::builder()
    .method("PATCH")
    .uri("/api/data/documents/workspace")
    .header("authorization", format!("Bearer {}", token(subject, KEY)))
    .header("content-type", "application/json")
    .body(Body::from(
      serde_json::to_vec(&json!({"revision": revision, "changes": changes})).unwrap(),
    ))
    .unwrap();
  app.clone().oneshot(request).await.unwrap()
}

async fn document(response: Response) -> Document {
  serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

#[tokio::test]
async fn bootstrap_requires_a_valid_bearer_token() {
  let request = Request::builder().uri("/api/data/bootstrap").body(Body::empty()).unwrap();
  assert_eq!(app().oneshot(request).await.unwrap().status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn forged_bearer_cannot_change_fixture_documents() {
  let request = Request::builder()
    .method("PATCH")
    .uri("/api/data/documents/workspace")
    .header("authorization", format!("Bearer {}", token("attacker", b"wrong-key")))
    .header("content-type", "application/json")
    .body(Body::from(r#"{"revision":0,"changes":{"appearance":"dark"}}"#))
    .unwrap();
  assert_eq!(app().oneshot(request).await.unwrap().status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn owners_have_separate_documents_and_stale_writes_conflict() {
  let app = app();
  let first = update(&app, "alice", 0, json!({"appearance": "dark"})).await;
  assert_eq!(first.status(), StatusCode::OK);
  assert_eq!(document(first).await.state["appearance"], "dark");
  let second = update(&app, "bob", 0, json!({"appearance": "light"})).await;
  assert_eq!(second.status(), StatusCode::OK);
  assert_eq!(document(second).await.state["appearance"], "light");
  let stale = update(&app, "alice", 0, json!({"appearance": "system"})).await;
  assert_eq!(stale.status(), StatusCode::CONFLICT);
  let current = document(stale).await;
  assert_eq!(current.revision, 1);
  assert_eq!(current.state["appearance"], "dark");
}

#[tokio::test]
async fn document_writes_cannot_replace_the_real_account() {
  let app = app();
  let response = update(
    &app,
    "alice",
    0,
    json!({"account": {"name": "Impersonated", "email": "other@example.test"}}),
  )
  .await;
  assert_eq!(response.status(), StatusCode::BAD_REQUEST);
  let valid = update(&app, "alice", 0, json!({"appearance": "dark"})).await;
  assert_eq!(valid.status(), StatusCode::OK);
  assert_eq!(document(valid).await.revision, 1);
}

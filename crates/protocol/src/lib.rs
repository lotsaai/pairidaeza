//! Contracts shared by the bearer-token API and browser gateway.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use validator::Validate;

/// The authenticated user's identity and OIDC profile.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct User {
  /// Provider subject, qualified by issuer.
  #[validate(length(min = 1))]
  pub id: String,
  /// Display name from the provider.
  pub name: String,
  /// Email address from the provider.
  pub email: String,
  /// Whether the provider verified the email address.
  pub email_verified: bool,
  /// Provider profile picture URL.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub picture: Option<String>,
  /// Provider preferred username.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub username: Option<String>,
  /// Provider given name.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub given_name: Option<String>,
  /// Provider family name.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub family_name: Option<String>,
  /// Provider locale.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub locale: Option<String>,
}

/// A versioned fixture-backed application document.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
pub struct Document {
  /// Revision used for optimistic concurrency.
  pub revision: u64,
  /// Application namespace fields.
  pub state: Map<String, Value>,
}

/// Authenticated identity alongside mocked application state.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
pub struct Bootstrap {
  /// Real authenticated profile, never a fixture identity.
  pub user: User,
  /// Fixture-backed documents keyed by namespace.
  pub documents: BTreeMap<String, Document>,
}

/// A document update conditional on its current revision.
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DocumentPatch {
  /// Revision the caller read.
  pub revision: u64,
  /// Fields to replace in this namespace.
  pub changes: Map<String, Value>,
}

/// Describes the shared bearer-token API using OpenAPI 3.1 and generated JSON Schema.
pub fn openapi() -> Value {
  let bearer = serde_json::json!([{"bearerAuth": []}]);
  let user = schema::<User>();
  let document = schema::<Document>();
  let bootstrap = schema::<Bootstrap>();
  let patch = schema::<DocumentPatch>();
  serde_json::json!({
    "openapi": "3.1.0",
    "info": {"title": "Pairidaeza API", "version": env!("CARGO_PKG_VERSION")},
    "components": {
      "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
      "schemas": {"User": user, "Document": document, "Bootstrap": bootstrap, "DocumentPatch": patch}
    },
    "paths": {
      "/healthz": {"get": {"responses": {"200": {"description": "Ready"}}}},
      "/api/user": {"get": {"security": bearer, "responses": {
        "200": {"description": "Authenticated provider profile", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/User"}}}},
        "401": {"description": "Missing or invalid bearer token"}, "502": {"description": "Provider request failed"}
      }}},
      "/api/data/bootstrap": {"get": {"security": bearer, "responses": {
        "200": {"description": "Real user with mocked application documents", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Bootstrap"}}}},
        "401": {"description": "Missing or invalid bearer token"}, "502": {"description": "Provider request failed"}
      }}},
      "/api/data/documents/{namespace}": {"patch": {
        "security": bearer,
        "parameters": [{"name": "namespace", "in": "path", "required": true, "schema": {"type": "string"}}],
        "requestBody": {"required": true, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DocumentPatch"}}}},
        "responses": {
          "200": {"description": "Updated document", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Document"}}}},
          "400": {"description": "Unknown or read-only document field"},
          "401": {"description": "Missing or invalid bearer token"},
          "404": {"description": "Unknown namespace"},
          "409": {"description": "Revision conflict", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Document"}}}}
        }
      }}
    }
  })
}

fn schema<T: JsonSchema>() -> Value {
  let mut settings = schemars::generate::SchemaSettings::draft2020_12();
  settings.inline_subschemas = true;
  settings.into_generator().into_root_schema_for::<T>().to_value()
}

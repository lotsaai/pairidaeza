use std::{path::PathBuf, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, patch},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use uuid::Uuid;

const MAX_BODY: usize = 1024 * 1024;
const COOKIE: &str = "pairidaeza_mock_session";
const FIXTURES: &[(&str, &str)] = &[
    ("workspace", include_str!("../fixtures/workspace.json")),
    ("models", include_str!("../fixtures/models.json")),
    ("voice", include_str!("../fixtures/voice.json")),
    ("memory", include_str!("../fixtures/memory.json")),
    ("vault", include_str!("../fixtures/vault.json")),
    ("usage", include_str!("../fixtures/usage.json")),
    ("computer", include_str!("../fixtures/computer.json")),
    ("approvals", include_str!("../fixtures/approvals.json")),
    (
        "integrations",
        include_str!("../fixtures/integrations.json"),
    ),
    ("templates", include_str!("../fixtures/templates.json")),
];

#[derive(Clone)]
pub(crate) struct MockApi {
    path: PathBuf,
    seeds: Arc<Map<String, Value>>,
}

#[derive(Serialize)]
struct Document {
    revision: i64,
    state: Map<String, Value>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Changes {
    revision: i64,
    changes: Map<String, Value>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct SessionRequest {
    #[serde(default)]
    reset: bool,
}

fn user() -> Value {
    json!({"id": "u1", "name": "Alex Rivera", "email": "alex@example.com"})
}

impl MockApi {
    pub(crate) fn open(path: PathBuf) -> eyre::Result<Self> {
        let mut seeds = Map::new();
        for (name, source) in FIXTURES {
            let value: Value = serde_json::from_str(source)?;
            if !value.is_object() {
                eyre::bail!("mock fixture {name} must be an object");
            }
            seeds.insert((*name).to_owned(), value);
        }
        let api = Self {
            path,
            seeds: Arc::new(seeds),
        };
        api.connection()?.execute_batch("CREATE TABLE IF NOT EXISTS mock_documents (owner TEXT NOT NULL, namespace TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(owner, namespace)); CREATE TABLE IF NOT EXISTS mock_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL)")?;
        Ok(api)
    }

    fn connection(&self) -> rusqlite::Result<Connection> {
        let db = Connection::open(&self.path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        Ok(db)
    }

    fn owner(&self, headers: &HeaderMap) -> Result<String, StatusCode> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .or_else(|| {
                headers
                    .get(header::COOKIE)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| {
                        value
                            .split(';')
                            .filter_map(|part| part.trim().split_once('='))
                            .find_map(|(name, value)| (name == COOKIE).then_some(value))
                    })
            })
            .ok_or(StatusCode::UNAUTHORIZED)?;
        self.connection()
            .and_then(|db| {
                db.query_row(
                    "SELECT owner FROM mock_sessions WHERE token = ?1",
                    [token],
                    |row| row.get(0),
                )
                .optional()
            })
            .map_err(internal)?
            .ok_or(StatusCode::UNAUTHORIZED)
    }

    fn seed(&self, db: &Connection, owner: &str) -> Result<(), StatusCode> {
        for (namespace, value) in self.seeds.iter() {
            db.execute("INSERT OR IGNORE INTO mock_documents (owner, namespace, revision, state) VALUES (?1, ?2, 0, ?3)", params![owner, namespace, value.to_string()]).map_err(internal)?;
        }
        Ok(())
    }
}

fn internal(error: impl std::fmt::Display) -> StatusCode {
    tracing::error!(%error, "mock API storage failure");
    StatusCode::INTERNAL_SERVER_ERROR
}

fn same_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN) else {
        return true;
    };
    let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    origin
        .to_str()
        .ok()
        .and_then(|v| url::Url::parse(v).ok())
        .is_some_and(|url| {
            url.scheme() == "http"
                && url.host_str().is_some_and(|name| {
                    let authority = match url.port() {
                        Some(port) => format!("{name}:{port}"),
                        None => name.to_owned(),
                    };
                    authority == host
                })
        })
}

pub(crate) fn router(api: MockApi) -> Router {
    Router::new()
        .route(
            "/session",
            get(get_session).post(post_session).delete(delete_session),
        )
        .route("/bootstrap", get(bootstrap))
        .route("/state/{namespace}", patch(update))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .with_state(api)
}

async fn get_session(
    State(api): State<MockApi>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    api.owner(&headers)?;
    Ok(Json(json!({"user": user()})))
}

async fn post_session(
    State(api): State<MockApi>,
    headers: HeaderMap,
    request: Option<Json<SessionRequest>>,
) -> Result<Response, StatusCode> {
    if !same_origin(&headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let token = Uuid::new_v4().to_string();
    let mut db = api.connection().map_err(internal)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(internal)?;
    if request.is_some_and(|Json(request)| request.reset) {
        tx.execute("DELETE FROM mock_documents WHERE owner = 'u1'", [])
            .map_err(internal)?;
        api.seed(&tx, "u1")?;
    }
    tx.execute(
        "INSERT INTO mock_sessions (token, owner) VALUES (?1, 'u1')",
        [&token],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    let cookie = format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict");
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, "no-store".to_owned()),
        ],
        Json(json!({"user": user(), "token": token})),
    )
        .into_response())
}

async fn delete_session(
    State(api): State<MockApi>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    if !same_origin(&headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let owner = api.owner(&headers)?;
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .or_else(|| {
            headers
                .get(header::COOKIE)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| {
                    v.split(';')
                        .filter_map(|part| part.trim().split_once('='))
                        .find_map(|(name, value)| (name == COOKIE).then_some(value))
                })
        })
        .ok_or(StatusCode::UNAUTHORIZED)?;
    api.connection()
        .and_then(|db| {
            db.execute(
                "DELETE FROM mock_sessions WHERE token = ?1 AND owner = ?2",
                params![token, owner],
            )
        })
        .map_err(internal)?;
    Ok((
        StatusCode::NO_CONTENT,
        [(
            header::SET_COOKIE,
            format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"),
        )],
    )
        .into_response())
}

async fn bootstrap(
    State(api): State<MockApi>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let owner = api.owner(&headers)?;
    let db = api.connection().map_err(internal)?;
    api.seed(&db, &owner)?;
    let mut statement = db
        .prepare("SELECT namespace, revision, state FROM mock_documents WHERE owner = ?1")
        .map_err(internal)?;
    let rows = statement
        .query_map([owner], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(internal)?;
    let mut documents = Map::new();
    for row in rows {
        let (namespace, revision, state) = row.map_err(internal)?;
        let state: Map<String, Value> = serde_json::from_str(&state).map_err(internal)?;
        documents.insert(
            namespace,
            serde_json::to_value(Document { revision, state }).map_err(internal)?,
        );
    }
    Ok(Json(json!({"user": user(), "documents": documents})))
}

async fn update(
    State(api): State<MockApi>,
    Path(namespace): Path<String>,
    headers: HeaderMap,
    Json(request): Json<Changes>,
) -> Result<Response, StatusCode> {
    if !same_origin(&headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let owner = api.owner(&headers)?;
    let seed = api
        .seeds
        .get(&namespace)
        .and_then(Value::as_object)
        .ok_or(StatusCode::NOT_FOUND)?;
    for (key, value) in &request.changes {
        let expected = seed.get(key).ok_or(StatusCode::BAD_REQUEST)?;
        if !expected.is_null() && std::mem::discriminant(expected) != std::mem::discriminant(value)
        {
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    let mut db = api.connection().map_err(internal)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(internal)?;
    api.seed(&tx, &owner)?;
    let (revision, state): (i64, String) = tx
        .query_row(
            "SELECT revision, state FROM mock_documents WHERE owner = ?1 AND namespace = ?2",
            params![owner, namespace],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(internal)?;
    let mut state: Map<String, Value> = serde_json::from_str(&state).map_err(internal)?;
    if revision != request.revision {
        return Ok((StatusCode::CONFLICT, Json(Document { revision, state })).into_response());
    }
    state.extend(request.changes);
    let revision = revision
        .checked_add(1)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    tx.execute(
        "UPDATE mock_documents SET revision = ?1, state = ?2 WHERE owner = ?3 AND namespace = ?4",
        params![
            revision,
            serde_json::to_string(&state).map_err(internal)?,
            owner,
            namespace
        ],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(Document { revision, state }).into_response())
}

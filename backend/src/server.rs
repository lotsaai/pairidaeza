//! The HTTP server: one axum router for every wire pairidaeza-backend speaks.
//!
//! Requests carrying WebSocket upgrade headers become JSON-RPC connections
//! through jsonrpsee's low-level upgrade API (`jsonrpsee::server::ws::connect`),
//! so the RPC socket, the auth routes, and the built web face share one
//! origin and the existing `ws://host:port` client URLs keep working at the
//! root path. Everything else falls through to the static web dist when one
//! is configured.
//!
//! pairidaeza-backend serves plain HTTP and binds loopback only. `tailscale serve`
//! terminates TLS and publishes the server to the tailnet, so no TLS material
//! exists here and the bind guard never needs relaxing.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::PoisonError;
use std::sync::atomic::{AtomicU32, Ordering};

use axum::Router;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use axum_login::AuthManagerLayerBuilder;
use http_body_util::BodyExt as _;
use jsonrpsee::core::server::{ConnectionId, Methods};
use jsonrpsee::server::middleware::rpc::RpcServiceBuilder;
use jsonrpsee::server::ws::is_upgrade_request;
use jsonrpsee::server::{
    ConnectionState, HttpResponse, RpcModule, ServerConfig, ServerHandle, StopHandle, stop_channel,
};
use tokio::sync::Semaphore;
use tower::ServiceExt as _;
use tower_http::services::ServeDir;
use tower_sessions::{Expiry, SessionManagerLayer, cookie::SameSite};

use crate::Error;
use crate::auth::{AuthSession, AuthState, Backend, session_token};
use crate::config::Config;
use crate::sessions::DbSessionStore;

/// The RPC half of the router state.
struct Rpc {
    methods: Methods,
    config: ServerConfig,
    /// `None` once a stop was signalled: late upgrades are refused instead of
    /// attaching to a draining server. The master handle lives here so
    /// [`ServerHandle::stopped`] (which waits for every receiver to drop) can
    /// resolve; the watcher task takes it when the stop fires.
    stop: Mutex<Option<StopHandle>>,
    next_connection: AtomicU32,
    /// Not a policy cap: `ConnectionState` requires a permit, so a semaphore
    /// must exist. The gate on this service is authentication, not a count.
    permits: Arc<Semaphore>,
}

/// Router state: the RPC half, the identity surface, and the optional
/// static half.
#[derive(Clone)]
struct ServerState {
    rpc: Arc<Rpc>,
    auth: Arc<AuthState>,
    static_files: Option<Router>,
    mock_api: Option<crate::mock_api::MockApi>,
}

/// Binds the axum server: `module` over WebSocket upgrades, the auth routes
/// under `/auth`, and, when `config.web_dist` is set, the built web face for
/// every other request.
///
/// Returns the bound address (resolved, so `127.0.0.1:0` is usable in tests)
/// and the handle that stops RPC connections; the HTTP listener closes with
/// it.
///
/// # Errors
///
/// [`Error::NonLoopbackBind`] for a non-loopback address, [`Error::Io`] when
/// the socket cannot be bound.
pub async fn serve(
    module: RpcModule<()>,
    config: &Config,
) -> eyre::Result<(SocketAddr, ServerHandle)> {
    if !config.listen.ip().is_loopback() {
        return Err(Error::NonLoopbackBind(config.listen).into());
    }
    if config.mock_auth && config.auth.session_key.is_some() {
        eyre::bail!("PAIRIDAEZA_MOCK_AUTH cannot be enabled with PAIRIDAEZA_AUTH__SESSION_KEY");
    }
    if config.auth.session_key.is_none() {
        tracing::warn!(
            "PAIRIDAEZA_AUTH__SESSION_KEY is unset: auth routes answer 503 and WebSocket upgrades go unauthenticated"
        );
    }
    std::fs::create_dir_all(config.data_dir()?)?;
    let (stop, handle) = stop_channel();
    let auth = Arc::new(AuthState::new(config.auth.clone()));
    let state = ServerState {
        rpc: Arc::new(Rpc {
            methods: Methods::from(module),
            config: ServerConfig::default(),
            stop: Mutex::new(Some(stop.clone())),
            next_connection: AtomicU32::new(0),
            permits: Arc::new(Semaphore::new(Semaphore::MAX_PERMITS)),
        }),
        auth,
        mock_api: if config.mock_auth {
            Some(crate::mock_api::MockApi::open(
                config.data_dir()?.join("mock.sqlite"),
            )?)
        } else {
            None
        },
        static_files: config
            .web_dist
            .clone()
            .map(|dist| Router::new().fallback_service(ServeDir::new(dist))),
    };
    let sessions = DbSessionStore::open(config.data_dir()?.join("browser-sessions.sqlite"))?;
    let session_layer = SessionManagerLayer::new(sessions)
        .with_name("pairidaeza_session")
        .with_secure(state.auth.cookie_secure())
        .with_http_only(true)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::hours(i64::from(
            config.auth.session_ttl_hours,
        ))));
    let auth_layer =
        AuthManagerLayerBuilder::new(Backend::new(Arc::clone(&state.auth)), session_layer).build();

    // Once the stop fires, drop the state's master handle so `stopped()`
    // resolves when the last connection finishes.
    let watcher_stop = stop.clone();
    let watcher_rpc = Arc::clone(&state.rpc);
    let app = router(state).layer(auth_layer);
    tokio::spawn(async move {
        watcher_stop.shutdown().await;
        watcher_rpc
            .stop
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
    });

    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let bound = listener.local_addr()?;
    tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(stop.shutdown())
            .await;
    });
    Ok((bound, handle))
}

/// The composed router: health, the auth routes, then the upgrade-or-static
/// fallback.
fn router(state: ServerState) -> Router {
    let auth = Arc::clone(&state.auth);
    let mock_api = state.mock_api.clone();
    let mut app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .nest_service("/auth", crate::auth::router(auth));
    if let Some(api) = mock_api {
        app = app.nest_service("/api/mock", crate::mock_api::router(api));
    }
    app.fallback(any(fallback)).with_state(state)
}

/// One fallback for both halves: a WebSocket upgrade becomes an RPC
/// connection, anything else is a static-file request.
async fn fallback(State(state): State<ServerState>, request: Request) -> Response {
    if is_upgrade_request(&request) {
        return upgrade(state, request).await;
    }
    match state.static_files {
        Some(statics) => match statics.oneshot(request).await {
            Ok(response) => response,
            Err(infallible) => match infallible {},
        },
        None => (
            StatusCode::NOT_FOUND,
            "pairidaeza-backend: no web dist configured",
        )
            .into_response(),
    }
}

/// Upgrades one request to a jsonrpsee WebSocket connection, behind the
/// session-token check when identity is configured.
async fn upgrade(state: ServerState, mut request: Request) -> Response {
    if state.auth.enabled() {
        let user = if let Some(token) = session_token(&request) {
            state.auth.verify(token).ok()
        } else if state.auth.same_origin(&request) {
            request
                .extensions()
                .get::<AuthSession>()
                .and_then(|session| session.user.clone())
        } else {
            None
        };
        match user {
            Some(user) => {
                request.extensions_mut().insert(crate::rpc::Owner(
                    serde_json::to_string(&(state.auth.issuer(), &user.sub))
                        .expect("identity serializes"),
                ));
                request.extensions_mut().insert(user);
            }
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    "pairidaeza-backend: sign in first",
                )
                    .into_response();
            }
        }
    }
    if !state.auth.enabled() {
        request
            .extensions_mut()
            .insert(crate::rpc::Owner("local-development".to_owned()));
    }
    let Some(stop) = state
        .rpc
        .stop
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
    else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "pairidaeza-backend is stopping",
        )
            .into_response();
    };
    let Ok(permit) = Arc::clone(&state.rpc.permits).try_acquire_owned() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "too many connections").into_response();
    };
    let id = state.rpc.next_connection.fetch_add(1, Ordering::Relaxed);
    // Seed the identity every RPC method resolves its caller from; the
    // built-in jsonrpsee server inserts the same extension before dispatch
    // (see `crate::connection::ClientConnection`).
    request.extensions_mut().insert(ConnectionId::from(id));
    let connection = ConnectionState::new(stop, id, permit);
    match jsonrpsee::server::ws::connect(
        request,
        state.rpc.config.clone(),
        state.rpc.methods.clone(),
        connection,
        RpcServiceBuilder::new(),
    )
    .await
    {
        Ok((response, drive)) => {
            tokio::spawn(drive);
            jsonrpsee_response(response).await
        }
        Err(response) => jsonrpsee_response(response).await,
    }
}

/// Converts a jsonrpsee response into an axum response. The jsonrpsee body
/// is not `Sync`, so it is collected into bytes; these bodies are either the
/// empty WebSocket handshake body or a short error string.
async fn jsonrpsee_response(response: HttpResponse) -> Response {
    let (parts, body) = response.into_parts();
    match body.collect().await {
        Ok(collected) => {
            axum::http::Response::from_parts(parts, axum::body::Body::from(collected.to_bytes()))
                .into_response()
        }
        Err(error) => {
            tracing::error!(%error, "jsonrpsee response body failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "pairidaeza-backend: response body failed",
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::AtomicU32;

    use secrecy::SecretString;

    use super::*;
    use crate::auth::{SessionUser, mint};

    /// Router state over an empty module and disabled auth; the stop handle is
    /// never fired here.
    fn state(web_dist: Option<PathBuf>) -> ServerState {
        let (stop, _handle) = stop_channel();
        ServerState {
            rpc: Arc::new(Rpc {
                methods: Methods::from(RpcModule::new(())),
                config: ServerConfig::default(),
                stop: Mutex::new(Some(stop)),
                next_connection: AtomicU32::new(0),
                permits: Arc::new(Semaphore::new(Semaphore::MAX_PERMITS)),
            }),
            auth: Arc::new(AuthState::new(crate::config::Auth::test_default())),
            mock_api: None,
            static_files: web_dist.map(|dist| Router::new().fallback_service(ServeDir::new(dist))),
        }
    }

    async fn get(app: Router, uri: &str) -> (StatusCode, String) {
        let request = Request::builder()
            .uri(uri)
            .body(axum::body::Body::empty())
            .expect("request");
        let response = app.oneshot(request).await.expect("router is infallible");
        let status = response.status();
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        (status, String::from_utf8(body.to_vec()).expect("utf8 body"))
    }

    /// Sends one raw request over a real socket and reads the response head.
    async fn raw(addr: SocketAddr, request: &str) -> String {
        use tokio::io::{AsyncBufReadExt as _, AsyncWriteExt as _, BufReader};

        let mut stream = tokio::net::TcpStream::connect(addr).await.expect("connect");
        stream.write_all(request.as_bytes()).await.expect("write");
        let mut reader = BufReader::new(stream);
        let mut head = String::new();
        loop {
            let mut line = String::new();
            let read = reader.read_line(&mut line).await.expect("read");
            if read == 0 || line == "\r\n" || line == "\n" {
                break;
            }
            head.push_str(&line);
        }
        head
    }

    fn upgrade_request(addr: SocketAddr, path: &str) -> String {
        use base64::Engine as _;

        let key = base64::engine::general_purpose::STANDARD.encode(rand::random::<[u8; 16]>());
        format!(
            "GET {path} HTTP/1.1\r\nhost: {addr}\r\nconnection: Upgrade\r\nupgrade: websocket\r\nsec-websocket-version: 13\r\nsec-websocket-key: {key}\r\n\r\n"
        )
    }

    #[tokio::test]
    async fn refuses_a_non_loopback_bind() {
        let mut config = Config::test_default();
        config.listen = "0.0.0.0:0".parse().expect("address");
        let error = serve(RpcModule::new(()), &config)
            .await
            .expect_err("non-loopback binds are refused");
        assert!(
            error
                .downcast_ref::<Error>()
                .is_some_and(|e| matches!(e, Error::NonLoopbackBind(_)))
        );
    }

    #[tokio::test]
    async fn healthz_answers_ok() {
        let (status, body) = get(router(state(None)), "/healthz").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "ok");
    }

    #[tokio::test]
    async fn plain_requests_404_without_a_web_dist() {
        let (status, _) = get(router(state(None)), "/").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn plain_requests_serve_the_web_dist() {
        // Inside the repo: the fixture lives under target/, never outside.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("server-test-dist");
        std::fs::create_dir_all(&dir).expect("fixture dir");
        std::fs::write(dir.join("index.html"), "<html>heyday</html>").expect("fixture write");

        let (status, body) = get(router(state(Some(dir.clone()))), "/").await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("heyday"), "served the dist index: {body}");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The bound listener (not just the router) serves health, the web dist,
    /// and 404s, and `stop` drains to `stopped`.
    #[tokio::test]
    async fn serves_health_dist_and_404_over_a_real_socket() {
        // Inside the repo: the fixture lives under target/, never outside.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("server-socket-dist");
        std::fs::create_dir_all(&dir).expect("fixture dir");
        std::fs::write(dir.join("index.html"), "<html>heyday</html>").expect("fixture write");

        let mut config = Config::test_default();
        config.web_dist = Some(dir.clone());
        let (addr, handle) = serve(RpcModule::new(()), &config).await.expect("serve");

        let health = raw(
            addr,
            &format!("GET /healthz HTTP/1.1\r\nhost: {addr}\r\nconnection: close\r\n\r\n"),
        )
        .await;
        assert!(health.starts_with("HTTP/1.1 200"), "healthz: {health}");

        let index = raw(
            addr,
            &format!("GET / HTTP/1.1\r\nhost: {addr}\r\nconnection: close\r\n\r\n"),
        )
        .await;
        assert!(index.starts_with("HTTP/1.1 200"), "index: {index}");

        let missing = raw(
            addr,
            &format!("GET /no-such-page HTTP/1.1\r\nhost: {addr}\r\nconnection: close\r\n\r\n"),
        )
        .await;
        assert!(missing.starts_with("HTTP/1.1 404"), "missing: {missing}");

        handle.stop().expect("stop");
        handle.stopped().await;
        std::fs::remove_dir_all(&dir).ok();
    }

    /// With a session key configured, an upgrade without a token is refused
    /// and one with a valid token completes the WebSocket handshake. The
    /// token is minted by the same code the Zitadel callback uses; no
    /// network is involved.
    #[tokio::test]
    async fn upgrades_require_a_session_token_when_auth_is_enabled() {
        let mut config = Config::test_default();
        let key = SecretString::from("test-session-key".to_owned());
        config.auth.session_key = Some(key.clone());
        let (addr, handle) = serve(RpcModule::new(()), &config).await.expect("serve");

        let refused = raw(addr, &upgrade_request(addr, "/")).await;
        assert!(refused.starts_with("HTTP/1.1 401"), "no token: {refused}");

        let garbage = raw(addr, &upgrade_request(addr, "/?token=not-a-token")).await;
        assert!(garbage.starts_with("HTTP/1.1 401"), "bad token: {garbage}");

        let user = SessionUser {
            sub: "test-sub".to_owned(),
            email: "test@lotsa.ai".to_owned(),
        };
        let token = mint(&key, &user, jiff::Span::new().hours(1)).expect("mint");
        let no_session = raw(
            addr,
            &format!("GET /auth/session HTTP/1.1\r\nhost: {addr}\r\nconnection: close\r\n\r\n"),
        )
        .await;
        assert!(
            no_session.starts_with("HTTP/1.1 401"),
            "no browser session: {no_session}"
        );
        let invalid_cookie = raw(
      addr,
      &format!("GET /auth/session HTTP/1.1\r\nhost: {addr}\r\ncookie: pairidaeza_session=invalid\r\nconnection: close\r\n\r\n"),
    )
    .await;
        assert!(
            invalid_cookie.starts_with("HTTP/1.1 401"),
            "invalid browser session: {invalid_cookie}"
        );
        let request = upgrade_request(addr, "/").replace(
            "\r\n\r\n",
            &format!("\r\nauthorization: Bearer {token}\r\n\r\n"),
        );
        let accepted = raw(addr, &request).await;
        assert!(
            accepted.starts_with("HTTP/1.1 101"),
            "valid token: {accepted}"
        );

        handle.stop().expect("stop");
        handle.stopped().await;
    }

    /// Without a session key (development), upgrades go through unchecked.
    #[tokio::test]
    async fn upgrades_pass_without_auth_when_no_session_key() {
        let config = Config::test_default();
        let (addr, handle) = serve(RpcModule::new(()), &config).await.expect("serve");
        let accepted = raw(addr, &upgrade_request(addr, "/")).await;
        assert!(
            accepted.starts_with("HTTP/1.1 101"),
            "unauthenticated dev: {accepted}"
        );
        handle.stop().expect("stop");
        handle.stopped().await;
    }
    #[tokio::test]
    async fn websocket_dispatch_carries_verified_owner() {
        use jsonrpsee::core::client::ClientT;
        let mut config = Config::test_default();
        let key = SecretString::from("test-session-key".to_owned());
        config.auth.session_key = Some(key.clone());
        let user = SessionUser {
            sub: "alice".into(),
            email: "alice@example.test".into(),
        };
        let token = mint(&key, &user, jiff::Span::new().hours(1)).unwrap();
        let mut module = RpcModule::new(());
        module
            .register_method("whoami", |_, _, ext| {
                ext.get::<crate::rpc::Owner>().unwrap().0.clone()
            })
            .unwrap();
        let (addr, handle) = serve(module, &config).await.unwrap();
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            format!("Bearer {token}").parse().unwrap(),
        );
        let client = jsonrpsee::ws_client::WsClientBuilder::default()
            .set_headers(headers)
            .build(format!("ws://{addr}"))
            .await
            .unwrap();
        let actual: String = client
            .request("whoami", jsonrpsee::rpc_params![])
            .await
            .unwrap();
        assert_eq!(
            actual,
            serde_json::to_string(&(config.auth.issuer.as_str(), "alice")).unwrap()
        );
        drop(client);
        handle.stop().unwrap();
        handle.stopped().await;
    }
    #[tokio::test]
    async fn mock_api_persists_revisions_sessions_and_empty_state() {
        use serde_json::{Value, json};

        let dir = tempfile::tempdir().unwrap();
        let mut config = Config::test_default();
        config.data_dir = Some(dir.path().to_owned());
        config.mock_auth = true;
        let client = reqwest::Client::new();
        let (addr, handle) = serve(RpcModule::new(()), &config).await.unwrap();
        let base = format!("http://{addr}/api/mock");
        assert_eq!(
            client
                .get(format!("{base}/bootstrap"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        let login: Value = client
            .post(format!("{base}/session"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let token = login["token"].as_str().unwrap().to_owned();
        let initial: Value = client
            .get(format!("{base}/bootstrap"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(initial["user"]["id"], "u1");
        let documents = initial["documents"].as_object().unwrap();
        let (namespace, key) = documents
            .iter()
            .find_map(|(name, document)| {
                document["state"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .find_map(|(key, value)| {
                        value
                            .as_array()
                            .filter(|items| !items.is_empty())
                            .map(|_| (name.clone(), key.clone()))
                    })
            })
            .expect("fixture has a non-empty array");
        let url = format!("{base}/state/{namespace}");
        let change = json!({"revision": 0, "changes": {(key.clone()): []}});
        let changed: Value = client
            .patch(&url)
            .bearer_auth(&token)
            .json(&change)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(changed["revision"], 1);
        assert_eq!(changed["state"][&key], json!([]));
        let stale = client
            .patch(&url)
            .bearer_auth(&token)
            .json(&change)
            .send()
            .await
            .unwrap();
        assert_eq!(stale.status(), StatusCode::CONFLICT);
        assert_eq!(stale.json::<Value>().await.unwrap(), changed);
        let invalid = json!({"revision": 1, "changes": {(key.clone()): "wrong type"}});
        assert_eq!(
            client
                .patch(&url)
                .bearer_auth(&token)
                .json(&invalid)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
        let unknown = json!({"revision": 1, "changes": {"unknown_field": []}});
        assert_eq!(
            client
                .patch(&url)
                .bearer_auth(&token)
                .json(&unknown)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            client
                .patch(format!("{base}/state/unknown"))
                .bearer_auth(&token)
                .json(&change)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        let oversized = format!(
            "{{\"revision\":1,\"changes\":{{\"{key}\":\"{}\"}}}}",
            "a".repeat(1024 * 1024)
        );
        assert_eq!(
            client
                .patch(&url)
                .bearer_auth(&token)
                .header("content-type", "application/json")
                .body(oversized)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        assert_eq!(
            client
                .post(format!("{base}/session"))
                .header("origin", "http://evil.example")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN
        );
        let db = rusqlite::Connection::open(dir.path().join("mock.sqlite")).unwrap();
        db.execute(
            "INSERT INTO mock_sessions (token, owner) VALUES ('other-token', 'other')",
            [],
        )
        .unwrap();
        db.execute("INSERT INTO mock_documents (owner, namespace, revision, state) VALUES ('other', ?1, 7, '{}')", [&namespace]).unwrap();
        let other: Value = client
            .get(format!("{base}/bootstrap"))
            .bearer_auth("other-token")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            other["documents"][&namespace],
            json!({"revision": 7, "state": {}})
        );
        let own: Value = client
            .get(format!("{base}/bootstrap"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(own["documents"][&namespace], changed);
        handle.stop().unwrap();
        handle.stopped().await;

        let (addr, handle) = serve(RpcModule::new(()), &config).await.unwrap();
        let base = format!("http://{addr}/api/mock");
        let restored: Value = client
            .get(format!("{base}/bootstrap"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(restored["documents"][&namespace], changed);
        assert_eq!(
            client
                .delete(format!("{base}/session"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            client
                .get(format!("{base}/session"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            client
                .get(format!("{base}/bootstrap"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        let reset: Value = client
            .post(format!("{base}/session"))
            .json(&json!({"reset": true}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let reset_token = reset["token"].as_str().unwrap();
        let reset_state: Value = client
            .get(format!("{base}/bootstrap"))
            .bearer_auth(reset_token)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            reset_state["documents"][&namespace],
            initial["documents"][&namespace]
        );
        handle.stop().unwrap();
        handle.stopped().await;
    }

    #[tokio::test]
    async fn mock_api_requires_explicit_mode_and_rejects_zitadel_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let mut config = Config::test_default();
        config.data_dir = Some(dir.path().to_owned());
        let (addr, handle) = serve(RpcModule::new(()), &config).await.unwrap();
        assert_eq!(
            reqwest::get(format!("http://{addr}/api/mock/bootstrap"))
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        handle.stop().unwrap();
        handle.stopped().await;
        config.mock_auth = true;
        config.auth.session_key = Some(SecretString::from("test-key".to_owned()));
        assert!(serve(RpcModule::new(()), &config).await.is_err());
    }
}

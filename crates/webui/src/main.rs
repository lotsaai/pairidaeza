mod browser;
mod oauth_http;
mod security;
mod session_auth;
mod session_data;

use std::future::Future;

use axum::{Router, routing::get};
use confique::Config as _;
use secrecy::ExposeSecret;
use telemetry::{Service, Telemetry};
use tower_http::services::ServeDir;
use webui::Config;

fn main() -> eyre::Result<()> {
  let telemetry = Telemetry::init(&Service {
    name: env!("CARGO_PKG_NAME"),
    version: env!("CARGO_PKG_VERSION"),
  })?;
  let outcome = run();
  if let Err(error) = &outcome {
    tracing::error!(%error, "web UI exited with an error");
  }
  telemetry.shutdown();
  outcome
}

fn run() -> eyre::Result<()> {
  let mut builder = Config::builder().env();
  if let Some(dir) = dirs::config_dir() {
    builder = builder.file(dir.join("pairidaeza").join("webui.toml"));
  }
  let config = builder.load()?;
  std::fs::File::open(config.web_dist.join("index.html"))?;
  tokio::runtime::Builder::new_multi_thread().enable_all().build()?.block_on(async {
    let shutdown = shutdown_signal()?;
    let postgres: tokio_postgres::Config = config.database_url.expose_secret().parse()?;
    let pool = deadpool_postgres::Pool::builder(deadpool_postgres::Manager::new(postgres, tokio_postgres::NoTls)).build()?;
    let routes = browser::router(&config, pool).await?;
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let bound = listener.local_addr()?;
    let app = Router::new()
      .route("/healthz", get(|| async { "ok" }))
      .merge(routes)
      .fallback_service(ServeDir::new(config.web_dist));
    tracing::info!(%bound, "web UI listening");
    axum::serve(listener, app).with_graceful_shutdown(shutdown).await?;
    tracing::info!("web UI stopped");
    Ok(())
  })
}

#[cfg(unix)]
fn shutdown_signal() -> std::io::Result<impl Future<Output = ()> + Send> {
  use tokio::signal::unix::{SignalKind, signal};

  let mut interrupt = signal(SignalKind::interrupt())?;
  let mut terminate = signal(SignalKind::terminate())?;
  Ok(async move {
    tokio::select! {
      _ = interrupt.recv() => {}
      _ = terminate.recv() => {}
    }
  })
}

#[cfg(windows)]
fn shutdown_signal() -> std::io::Result<impl Future<Output = ()> + Send> {
  use tokio::signal::windows::{ctrl_break, ctrl_c, ctrl_close, ctrl_shutdown};

  let mut interrupt = ctrl_c()?;
  let mut interrupt_break = ctrl_break()?;
  let mut close = ctrl_close()?;
  let mut shutdown = ctrl_shutdown()?;
  Ok(async move {
    tokio::select! {
      _ = interrupt.recv() => {}
      _ = interrupt_break.recv() => {}
      _ = close.recv() => {}
      _ = shutdown.recv() => {}
    }
  })
}

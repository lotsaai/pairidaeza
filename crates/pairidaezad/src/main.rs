use std::future::Future;

use pairidaezad::{Config, application};
use telemetry::{Service, Telemetry};

fn main() -> eyre::Result<()> {
  // Telemetry is built before the runtime: the OTLP exporter creates a blocking HTTP client.
  let telemetry = Telemetry::init(&Service {
    name: env!("CARGO_PKG_NAME"),
    version: env!("CARGO_PKG_VERSION"),
  })?;

  let outcome = run();
  if let Err(error) = &outcome {
    tracing::error!(%error, "API exited with an error");
  }
  telemetry.shutdown();
  outcome
}

fn run() -> eyre::Result<()> {
  let config = Config::load()?;
  tokio::runtime::Builder::new_multi_thread().enable_all().build()?.block_on(async {
    let shutdown = shutdown_signal()?;
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let bound = listener.local_addr()?;
    let (app, jwks_shutdown) = application(&config.auth).await?;
    tracing::info!(%bound, "API listening");
    let result = axum::serve(listener, app).with_graceful_shutdown(shutdown).await;
    jwks_shutdown.cancel();
    result?;
    tracing::info!("API stopped");
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

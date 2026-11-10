mod auth;
mod bootstrap;
mod config;
mod daemon_error;
mod mock_api;
mod rpc;
mod server;
mod sessions;

use daemon_error::{Error, Result};

#[tokio::main]
async fn main() -> eyre::Result<()> {
    let _tracing_guard = bootstrap::logging::init()?;
    bootstrap::init_propagation()?;
    let config = config::Config::load()?;
    let module = rpc::module(config.data_dir()?)?;
    let (bound, handle) = server::serve(module, &config).await?;
    tracing::info!(%bound, "pairidaeza backend listening");
    tokio::signal::ctrl_c().await?;
    handle.stop()?;
    handle.stopped().await;
    Ok(())
}

use jsonrpsee::{
    server::{Extensions, RpcModule},
    types::ErrorObjectOwned,
};
use pairidaeza_backend::{
    runtime,
    store::{Run, Store},
};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Clone)]
pub(crate) struct Owner(pub String);

fn owner(ext: &Extensions) -> Result<String, ErrorObjectOwned> {
    ext.get::<Owner>()
        .map(|owner| owner.0.clone())
        .ok_or_else(|| error("missing authenticated identity"))
}
fn error(message: &str) -> ErrorObjectOwned {
    ErrorObjectOwned::owned(-32000, message, None::<()>)
}
fn failure(error: impl std::fmt::Display) -> ErrorObjectOwned {
    tracing::warn!(%error, "run RPC failed");
    self::error("run operation failed")
}
#[derive(Deserialize)]
struct Start {
    prompt: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunId {
    run_id: String,
}

pub(crate) fn module(
    data_dir: PathBuf,
) -> Result<RpcModule<()>, jsonrpsee::core::RegisterMethodError> {
    let mut module = RpcModule::new(());
    let path = data_dir.clone();
    module.register_async_method("run.start", move |params, _, ext| {
        let path = path.clone();
        async move {
            let request: Start = params.parse()?;
            let owner = owner(&ext)?;
            let worker_path = path.clone();
            let worker_owner = owner.clone();
            let run = tokio::task::spawn_blocking(move || {
                let mut store = Store::open(&path)?;
                runtime::start(&mut store, &owner)
            })
            .await
            .map_err(failure)?
            .map_err(failure)?;
            let run_id = run.run_id.clone();
            tokio::task::spawn_blocking(move || {
                let result = Store::open(&worker_path).and_then(|mut store| {
                    runtime::run(&mut store, &worker_owner, &run_id, &request.prompt)
                });
                if let Err(error) = result {
                    tracing::warn!(%error, %run_id, "run worker failed");
                }
            });
            Ok::<Run, ErrorObjectOwned>(run)
        }
    })?;
    let path = data_dir.clone();
    module.register_async_method("run.status", move |params, _, ext| {
        let path = path.clone();
        async move {
            let request: RunId = params.parse()?;
            let owner = owner(&ext)?;
            tokio::task::spawn_blocking(move || {
                Store::open(&path)
                    .and_then(|store| runtime::status(&store, &owner, &request.run_id))
            })
            .await
            .map_err(failure)?
            .map_err(failure)
        }
    })?;
    module.register_async_method("run.cancel", move |params, _, ext| {
        let path = data_dir.clone();
        async move {
            let request: RunId = params.parse()?;
            let owner = owner(&ext)?;
            tokio::task::spawn_blocking(move || {
                Store::open(&path)
                    .and_then(|store| runtime::cancel(&store, &owner, &request.run_id))
            })
            .await
            .map_err(failure)?
            .map_err(failure)
        }
    })?;
    Ok(module)
}

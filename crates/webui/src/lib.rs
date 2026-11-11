//! Browser configuration and PostgreSQL-backed browser sessions.

mod axumext;
mod config;
mod error;

pub use axumext::PostgresStore;
pub use config::{Auth, Config};
pub use error::Error;

/// The result of a browser-session store operation.
pub type Result<T, E> = std::result::Result<T, Error<E>>;

use thiserror::Error;

/// A failure loading or persisting a browser session.
#[derive(Debug, Error)]
pub enum Error<E> {
  /// A PostgreSQL operation failed.
  #[error(transparent)]
  Postgres(#[from] tokio_postgres::Error),
  /// The PostgreSQL pool could not provide a connection.
  #[error(transparent)]
  Pool(#[from] deadpool_postgres::PoolError),
  /// A session record could not be encoded.
  #[error(transparent)]
  Encode(#[from] cbor4ii::serde::EncodeError<E>),
  /// A session record could not be decoded.
  #[error(transparent)]
  Decode(#[from] cbor4ii::serde::DecodeError<E>),
  /// A session expiry could not be represented.
  #[error(transparent)]
  Jiff(#[from] jiff::Error),
}

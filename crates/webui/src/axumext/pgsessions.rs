//! PostgreSQL-backed browser sessions encoded as CBOR in `tower_sessions.session`.

use std::fmt::Debug;
use std::marker::PhantomData;

use crate::{Error, Result};

use async_trait::async_trait;
use deadpool_postgres::{GenericClient, Pool};
use time::OffsetDateTime;
use tokio_postgres::error::SqlState;
use tower_sessions::session::{Id, Record};
use tower_sessions::session_store::{self, Error as StoreError, SessionStore};

impl<E: std::fmt::Debug> From<Error<E>> for StoreError {
  fn from(err: Error<E>) -> Self {
    match err {
      Error::Postgres(e) => StoreError::Backend(e.to_string()),
      Error::Pool(e) => StoreError::Backend(e.to_string()),
      Error::Decode(cbor4ii::serde::DecodeError::Core(e)) => StoreError::Decode(e.to_string()),
      Error::Decode(cbor4ii::serde::DecodeError::Custom(e)) => StoreError::Decode(e.to_string()),
      Error::Encode(cbor4ii::serde::EncodeError::Core(e)) => StoreError::Encode(e.to_string()),
      Error::Encode(cbor4ii::serde::EncodeError::Custom(e)) => StoreError::Encode(e.to_string()),
      Error::Jiff(e) => StoreError::Backend(e.to_string()),
    }
  }
}

/// Browser-session storage backed by the existing PostgreSQL pool.
#[derive(Clone, Debug)]
pub struct PostgresStore<E: Debug> {
  pool: Pool,
  _phantom: PhantomData<E>,
}

impl<E> PostgresStore<E>
where
  E: std::fmt::Debug,
{
  /// Creates a browser-session store using the supplied pool.
  pub fn new(pool: Pool) -> Self {
    Self {
      pool,
      _phantom: PhantomData,
    }
  }

  /// Creates the session schema and table if they do not exist.
  ///
  /// # Errors
  /// Returns a pool or PostgreSQL error if initialization fails.
  pub async fn migrate(&self) -> Result<(), E> {
    let client = self.pool.get().await?;
    client
      .batch_execute(r#"create schema if not exists "tower_sessions""#)
      .await
      .or_else(|e| {
        // concurrent starts may race the schema create — tolerate dup.
        let dup = matches!(
            e.code(),
            Some(c) if c == &SqlState::DUPLICATE_SCHEMA || c == &SqlState::UNIQUE_VIOLATION
        );
        if dup { Ok(()) } else { Err(Error::Postgres(e)) }
      })?;
    client
      .batch_execute(
        r#"create table if not exists "tower_sessions"."session" (
                       id text primary key not null,
                       data bytea not null,
                       expiry_date timestamptz not null
                   );
                   create table if not exists "tower_sessions"."oidc_transaction" (
                       state text primary key,
                       session_id text not null,
                       verifier text not null,
                       nonce text not null,
                       expiry_date timestamptz not null
                   );
                   create table if not exists "tower_sessions"."identity" (
                       id text primary key,
                       data jsonb not null,
                       expiry_date timestamptz not null
                   )"#,
      )
      .await?;
    Ok(())
  }

  async fn id_exists(&self, client: &impl GenericClient, id: &Id) -> session_store::Result<bool> {
    let row = client
      .query_one(
        r#"select exists(select 1 from "tower_sessions"."session" where id = $1)"#,
        &[&id.to_string()],
      )
      .await
      .map_err(Error::<E>::from)?;
    Ok(row.get::<_, bool>(0))
  }

  async fn save_with_conn(&self, client: &impl GenericClient, record: &Record) -> session_store::Result<()> {
    let payload = cbor4ii::serde::to_vec(vec![], record).map_err(Error::from)?;
    let expiry = timestamp_from_offset::<E>(record.expiry_date)?;
    client
      .execute(
        r#"insert into "tower_sessions"."session" (id, data, expiry_date)
                   values ($1, $2, $3)
                   on conflict (id) do update
                   set data = excluded.data, expiry_date = excluded.expiry_date"#,
        &[&record.id.to_string(), &payload, &expiry],
      )
      .await
      .map_err(Error::<E>::from)?;
    Ok(())
  }
}

#[async_trait]
impl<E> SessionStore for PostgresStore<E>
where
  E: std::fmt::Debug + Send + Sync + 'static,
{
  async fn create(&self, record: &mut Record) -> session_store::Result<()> {
    let mut client = self.pool.get().await.map_err(Error::<E>::from)?;
    let tx = client.transaction().await.map_err(Error::<E>::from)?;
    while self.id_exists(&tx, &record.id).await? {
      record.id = Id::default();
    }
    self.save_with_conn(&tx, record).await?;
    tx.commit().await.map_err(Error::<E>::from)?;
    Ok(())
  }

  async fn save(&self, record: &Record) -> session_store::Result<()> {
    let client = self.pool.get().await.map_err(Error::<E>::from)?;
    self.save_with_conn(&client, record).await
  }

  async fn load(&self, session_id: &Id) -> session_store::Result<Option<Record>> {
    let client = self.pool.get().await.map_err(Error::<E>::from)?;
    let now = timestamp_from_offset::<E>(OffsetDateTime::now_utc())?;
    let row = client
      .query_opt(
        r#"select data from "tower_sessions"."session"
                   where id = $1 and expiry_date > $2"#,
        &[&session_id.to_string(), &now],
      )
      .await
      .map_err(Error::<E>::from)?;
    match row {
      Some(row) => {
        let data: Vec<u8> = row.get(0);
        Ok(Some(cbor4ii::serde::from_slice(&data).map_err(Error::Decode)?))
      }
      None => Ok(None),
    }
  }

  async fn delete(&self, session_id: &Id) -> session_store::Result<()> {
    let client = self.pool.get().await.map_err(Error::<E>::from)?;
    client
      .execute(
        r#"delete from "tower_sessions"."session" where id = $1"#,
        &[&session_id.to_string()],
      )
      .await
      .map_err(Error::<E>::from)?;
    Ok(())
  }
}

fn timestamp_from_offset<E: std::fmt::Debug>(dt: OffsetDateTime) -> Result<jiff::Timestamp, E> {
  Ok(jiff::Timestamp::from_nanosecond(dt.unix_timestamp_nanos())?)
}

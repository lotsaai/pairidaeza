use deadpool_postgres::Pool;
use serde::{Deserialize, Serialize};

use openidconnect::{OAuth2TokenResponse, RefreshToken};

use crate::{browser::Client, oauth_http};
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Identity {
  pub id: String,
  pub subject: String,
  pub auth_hash: String,
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub expires_at: i64,
}

pub(crate) struct LoginTransaction {
  pub verifier: String,
  pub nonce: String,
}

#[derive(Clone)]
pub(crate) struct SessionData {
  pool: Pool,
  ttl_hours: u32,
}

impl SessionData {
  pub(crate) fn new(pool: Pool, ttl_hours: u32) -> Self {
    Self { pool, ttl_hours }
  }

  pub(crate) async fn insert_transaction(&self, state: &str, session_id: &str, verifier: &str, nonce: &str) -> eyre::Result<()> {
    self
      .pool
      .get()
      .await?
      .execute(
        r#"insert into tower_sessions.oidc_transaction (state, session_id, verifier, nonce, expiry_date)
         values ($1, $2, $3, $4, now() + interval '10 minutes')"#,
        &[&state, &session_id, &verifier, &nonce],
      )
      .await?;
    Ok(())
  }

  pub(crate) async fn consume_transaction(&self, state: &str, session_id: &str) -> eyre::Result<Option<LoginTransaction>> {
    let row = self
      .pool
      .get()
      .await?
      .query_opt(
        r#"delete from tower_sessions.oidc_transaction
         where state = $1 and session_id = $2 and expiry_date > now()
         returning verifier, nonce"#,
        &[&state, &session_id],
      )
      .await?;
    Ok(row.map(|row| LoginTransaction {
      verifier: row.get(0),
      nonce: row.get(1),
    }))
  }

  pub(crate) async fn save_identity(&self, identity: &Identity) -> eyre::Result<()> {
    let value = serde_json::to_value(identity)?;
    let ttl_hours = i64::from(self.ttl_hours);
    self
      .pool
      .get()
      .await?
      .execute(
        r#"insert into tower_sessions.identity (id, data, expiry_date)
         values ($1, $2, now() + $3::bigint * interval '1 hour')
         on conflict (id) do update set data = excluded.data, expiry_date = excluded.expiry_date"#,
        &[&identity.id, &value, &ttl_hours],
      )
      .await?;
    Ok(())
  }

  pub(crate) async fn access_token(&self, oidc: &Client, http: &reqwest::Client, id: &str) -> eyre::Result<Option<String>> {
    let mut connection = self.pool.get().await?;
    let transaction = connection.transaction().await?;
    let row = transaction
      .query_opt(
        "select data from tower_sessions.identity where id = $1 and expiry_date > now() for update",
        &[&id],
      )
      .await?;
    let Some(row) = row else { return Ok(None) };
    let mut identity: Identity = serde_json::from_value(row.get(0))?;
    if identity.expires_at <= time::OffsetDateTime::now_utc().unix_timestamp().saturating_add(30) {
      let Some(refresh_token) = identity.refresh_token.as_ref() else {
        transaction
          .execute("delete from tower_sessions.identity where id = $1", &[&id])
          .await?;
        transaction.commit().await?;
        return Ok(None);
      };
      let adapter = {
        let client = http.clone();
        move |request| {
          let client = client.clone();
          async move { oauth_http::request(&client, request).await }
        }
      };
      let response = oidc
        .exchange_refresh_token(&RefreshToken::new(refresh_token.clone()))?
        .request_async(&adapter)
        .await?;
      let expires = response.expires_in().ok_or_else(|| eyre::eyre!("refresh response lacks expiry"))?;
      identity.expires_at = time::OffsetDateTime::now_utc()
        .unix_timestamp()
        .checked_add(i64::try_from(expires.as_secs())?)
        .ok_or_else(|| eyre::eyre!("invalid refresh expiry"))?;
      identity.access_token = response.access_token().secret().clone();
      if let Some(token) = response.refresh_token() {
        identity.refresh_token = Some(token.secret().clone());
      }
      let value = serde_json::to_value(&identity)?;
      transaction
        .execute("update tower_sessions.identity set data = $2 where id = $1", &[&id, &value])
        .await?;
    }
    transaction.commit().await?;
    Ok(Some(identity.access_token))
  }

  pub(crate) async fn identity(&self, id: &str) -> eyre::Result<Option<Identity>> {
    let row = self
      .pool
      .get()
      .await?
      .query_opt(
        "select data from tower_sessions.identity where id = $1 and expiry_date > now()",
        &[&id],
      )
      .await?;
    row.map(|row| serde_json::from_value(row.get(0)).map_err(Into::into)).transpose()
  }

  pub(crate) async fn delete_identity(&self, id: &str) -> eyre::Result<()> {
    self
      .pool
      .get()
      .await?
      .execute("delete from tower_sessions.identity where id = $1", &[&id])
      .await?;
    Ok(())
  }
}

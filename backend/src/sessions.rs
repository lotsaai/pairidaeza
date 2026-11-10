use async_trait::async_trait;
use rusqlite::{Connection, OptionalExtension, params};
use std::{collections::HashMap, path::PathBuf};
use time::OffsetDateTime;
use tower_sessions::{
    session::{Id, Record},
    session_store::{self, SessionStore},
};

#[derive(Clone, Debug)]
pub(crate) struct DbSessionStore {
    path: PathBuf,
}

fn backend(error: impl std::fmt::Display) -> session_store::Error {
    session_store::Error::Backend(error.to_string())
}
impl DbSessionStore {
    pub(crate) fn open(path: PathBuf) -> rusqlite::Result<Self> {
        Connection::open(&path)?.execute_batch("CREATE TABLE IF NOT EXISTS browser_sessions (id TEXT PRIMARY KEY, data BLOB NOT NULL, expiry INTEGER NOT NULL)")?;
        Ok(Self { path })
    }
    async fn execute<T: Send + 'static>(
        &self,
        f: impl FnOnce(Connection) -> session_store::Result<T> + Send + 'static,
    ) -> session_store::Result<T> {
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || f(Connection::open(path).map_err(backend)?))
            .await
            .map_err(backend)?
    }
}
#[async_trait]
impl SessionStore for DbSessionStore {
    async fn create(&self, record: &mut Record) -> session_store::Result<()> {
        loop {
            let id = record.id.to_string();
            let data = serde_json::to_vec(&record.data)
                .map_err(|e| session_store::Error::Encode(e.to_string()))?;
            let expiry = record.expiry_date.unix_timestamp();
            let inserted = self
                .execute(move |db| {
                    db.execute(
                        "INSERT OR IGNORE INTO browser_sessions VALUES (?1, ?2, ?3)",
                        params![id, data, expiry],
                    )
                    .map_err(backend)
                })
                .await?;
            if inserted == 1 {
                return Ok(());
            }
            record.id = Id::default();
        }
    }
    async fn save(&self, record: &Record) -> session_store::Result<()> {
        let id = record.id.to_string();
        let data = serde_json::to_vec(&record.data)
            .map_err(|e| session_store::Error::Encode(e.to_string()))?;
        let expiry = record.expiry_date.unix_timestamp();
        self.execute(move |db| { db.execute("INSERT INTO browser_sessions VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data, expiry=excluded.expiry", params![id, data, expiry]).map_err(backend)?; Ok(()) }).await
    }
    async fn load(&self, id: &Id) -> session_store::Result<Option<Record>> {
        let key = id.to_string();
        let id = *id;
        self.execute(move |db| {
            let row: Option<(Vec<u8>, i64)> = db
                .query_row(
                    "SELECT data, expiry FROM browser_sessions WHERE id=?1 AND expiry>?2",
                    params![key, OffsetDateTime::now_utc().unix_timestamp()],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(backend)?;
            row.map(|(data, expiry)| {
                let data: HashMap<String, serde_json::Value> = serde_json::from_slice(&data)
                    .map_err(|e| session_store::Error::Decode(e.to_string()))?;
                let expiry_date = OffsetDateTime::from_unix_timestamp(expiry).map_err(backend)?;
                Ok(Record {
                    id,
                    data,
                    expiry_date,
                })
            })
            .transpose()
        })
        .await
    }
    async fn delete(&self, id: &Id) -> session_store::Result<()> {
        let id = id.to_string();
        self.execute(move |db| {
            db.execute("DELETE FROM browser_sessions WHERE id=?1", [id])
                .map_err(backend)?;
            Ok(())
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn sessions_survive_reopening_and_delete() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sessions.sqlite");
        let first = DbSessionStore::open(path.clone()).unwrap();
        let mut record = Record {
            id: Id::default(),
            data: HashMap::new(),
            expiry_date: OffsetDateTime::now_utc() + time::Duration::hours(1),
        };
        record
            .data
            .insert("user".into(), serde_json::json!("alice"));
        first.create(&mut record).await.unwrap();
        let reopened = DbSessionStore::open(path).unwrap();
        assert_eq!(
            reopened.load(&record.id).await.unwrap().unwrap().data,
            record.data
        );
        reopened.delete(&record.id).await.unwrap();
        assert!(first.load(&record.id).await.unwrap().is_none());
    }
}

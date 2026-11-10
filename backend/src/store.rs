use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    time::Duration,
};

use eyre::{Result, bail};
use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

pub struct Store {
    dir: PathBuf,
    db: Connection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub run_id: String,
    pub session_id: String,
    pub status: String,
    pub result: Option<String>,
}

impl Store {
    pub fn open(dir: &Path) -> Result<Self> {
        fs::create_dir_all(dir)?;
        let db = Connection::open(dir.join("state.sqlite3"))?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, status TEXT NOT NULL, result TEXT); CREATE TABLE IF NOT EXISTS notes (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id, key)); CREATE TABLE IF NOT EXISTS calls (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, call_id TEXT NOT NULL, name TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL, error TEXT, PRIMARY KEY(owner_id, session_id, call_id));")?;
        Ok(Self {
            dir: dir.to_owned(),
            db,
        })
    }

    pub(crate) fn insert(&self, owner: &str, id: &str, session: &str) -> Result<()> {
        self.db.execute(
            "INSERT INTO runs (id, owner_id, session_id, status) VALUES (?1, ?2, ?3, 'ready')",
            params![id, owner, session],
        )?;
        Ok(())
    }

    pub(crate) fn get(&self, owner: &str, id: &str) -> Result<Run> {
        Uuid::parse_str(id)?;
        Ok(self.db.query_row(
            "SELECT id, session_id, status, result FROM runs WHERE id = ?1 AND owner_id = ?2",
            params![id, owner],
            |r| {
                Ok(Run {
                    run_id: r.get(0)?,
                    session_id: r.get(1)?,
                    status: r.get(2)?,
                    result: r.get(3)?,
                })
            },
        )?)
    }

    pub(crate) fn lock(&self, id: &str) -> Result<File> {
        Uuid::parse_str(id)?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.dir.join(format!("{id}.lock")))?;
        FileExt::try_lock_exclusive(&file)?;
        Ok(file)
    }

    pub(crate) fn recover(&self, owner: &str, id: &str) -> Result<Run> {
        let run = self.get(owner, id)?;
        if matches!(run.status.as_str(), "running" | "cancel_requested") {
            match self.lock(id) {
                Ok(_lock) => {
                    self.db.execute("UPDATE runs SET status = 'interrupted' WHERE id = ?1 AND owner_id = ?2 AND status IN ('running', 'cancel_requested')", params![id, owner])?;
                }
                Err(error)
                    if error
                        .downcast_ref::<std::io::Error>()
                        .is_some_and(|e| e.kind() == std::io::ErrorKind::WouldBlock) => {}
                Err(error) => return Err(error),
            }
        }
        self.get(owner, id)
    }

    pub(crate) fn transition(&self, owner: &str, id: &str, from: &str, to: &str) -> Result<bool> {
        Ok(self.db.execute(
            "UPDATE runs SET status = ?4 WHERE id = ?1 AND owner_id = ?2 AND status = ?3",
            params![id, owner, from, to],
        )? == 1)
    }

    pub(crate) fn finish(
        &self,
        owner: &str,
        id: &str,
        status: &str,
        result: Option<&str>,
    ) -> Result<()> {
        let changed = self.db.execute("UPDATE runs SET status = CASE WHEN ?3 = 'cancelled' AND status != 'cancel_requested' THEN 'failed' ELSE ?3 END, result = CASE WHEN ?3 = 'succeeded' THEN ?4 ELSE NULL END WHERE id = ?1 AND owner_id = ?2 AND status IN ('running', 'cancel_requested')", params![id, owner, status, result])?;
        if changed != 1 {
            bail!("run is not active");
        }
        Ok(())
    }

    pub(crate) fn tool(
        &mut self,
        owner: &str,
        session: &str,
        call: &str,
        name: &str,
        input: &Value,
    ) -> Result<(String, Option<String>, bool)> {
        let encoded = serde_json::to_string(input)?;
        let tx = self
            .db
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<(String, String, String, Option<String>)> = tx.query_row("SELECT name, input, output, error FROM calls WHERE owner_id = ?1 AND session_id = ?2 AND call_id = ?3", params![owner, session, call], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).optional()?;
        if let Some((old_name, old_input, output, error)) = previous {
            if old_name != name || old_input != encoded {
                bail!("tool call id reused with different input");
            }
            return Ok((output, error, true));
        }
        let (output, error) = match (name, input.as_object()) {
            ("note_read", Some(obj))
                if obj.len() == 1 && obj.get("key").and_then(Value::as_str).is_some() =>
            {
                let key = obj.get("key").and_then(Value::as_str).unwrap_or_default();
                let value: Option<String> = tx
                    .query_row(
                        "SELECT value FROM notes WHERE owner_id = ?1 AND key = ?2",
                        params![owner, key],
                        |r| r.get(0),
                    )
                    .optional()?;
                (json!({"value": value}).to_string(), None)
            }
            ("note_write", Some(obj))
                if obj.len() == 2
                    && obj.get("key").and_then(Value::as_str).is_some()
                    && obj.get("value").and_then(Value::as_str).is_some() =>
            {
                let key = obj.get("key").and_then(Value::as_str).unwrap_or_default();
                let value = obj.get("value").and_then(Value::as_str).unwrap_or_default();
                tx.execute("INSERT INTO notes (owner_id, key, value) VALUES (?1, ?2, ?3) ON CONFLICT(owner_id, key) DO UPDATE SET value = excluded.value", params![owner, key, value])?;
                (json!({"written": true}).to_string(), None)
            }
            _ => (
                String::new(),
                Some("unknown tool or invalid input".to_owned()),
            ),
        };
        tx.execute(
            "INSERT INTO calls VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![owner, session, call, name, encoded, output, error],
        )?;
        tx.commit()?;
        Ok((output, error, false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notes_and_call_results_survive_reopen_and_deduplicate() -> Result<()> {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let mut store = Store::open(&dir)?;
        let input = json!({"key":"a", "value":"first"});
        assert!(!store.tool("alice", "s", "1", "note_write", &input)?.2);
        drop(store);
        let mut store = Store::open(&dir)?;
        assert!(store.tool("alice", "s", "1", "note_write", &input)?.2);
        assert!(
            store
                .tool(
                    "alice",
                    "s",
                    "1",
                    "note_write",
                    &json!({"key":"a", "value":"second"})
                )
                .is_err()
        );
        assert_eq!(
            store
                .tool("alice", "s", "2", "note_read", &json!({"key":"a"}))?
                .0,
            json!({"value":"first"}).to_string()
        );
        assert_eq!(
            store
                .tool("bob", "s", "2", "note_read", &json!({"key":"a"}))?
                .0,
            json!({"value":null}).to_string()
        );
        store.tool(
            "alice",
            "s",
            "3",
            "note_write",
            &json!({"key":"a", "value":"later"}),
        )?;
        assert!(store.tool("alice", "s", "1", "note_write", &input)?.2);
        assert_eq!(
            store
                .tool("alice", "s", "4", "note_read", &json!({"key":"a"}))?
                .0,
            json!({"value":"later"}).to_string()
        );
        drop(store);
        fs::remove_dir_all(dir)?;
        Ok(())
    }

    #[test]
    fn abandoned_run_is_interrupted_not_replayed() -> Result<()> {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let store = Store::open(&dir)?;
        let id = Uuid::new_v4().to_string();
        store.insert("alice", &id, "session")?;
        assert!(store.get("bob", &id).is_err());
        let lock = store.lock(&id)?;
        assert!(store.transition("alice", &id, "ready", "running")?);
        assert_eq!(store.recover("alice", &id)?.status, "running");
        drop(lock);
        assert_eq!(store.recover("alice", &id)?.status, "interrupted");
        assert!(!store.transition("alice", &id, "ready", "running")?);
        drop(store);
        fs::remove_dir_all(dir)?;
        Ok(())
    }

    #[test]
    fn cancellation_without_turn_done_is_interrupted() -> Result<()> {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let store = Store::open(&dir)?;
        let id = Uuid::new_v4().to_string();
        store.insert("alice", &id, "session")?;
        assert!(store.transition("alice", &id, "ready", "running")?);
        assert!(store.transition("alice", &id, "running", "cancel_requested")?);
        store.finish("alice", &id, "interrupted", None)?;
        assert_eq!(store.get("alice", &id)?.status, "interrupted");
        let other = Uuid::new_v4().to_string();
        store.insert("alice", &other, "session-2")?;
        assert!(store.transition("alice", &other, "ready", "running")?);
        assert!(store.transition("alice", &other, "running", "cancel_requested")?);
        store.finish("alice", &other, "succeeded", Some("answer"))?;
        assert_eq!(store.get("alice", &other)?.status, "succeeded");
        assert_eq!(
            store.get("alice", &other)?.result.as_deref(),
            Some("answer")
        );
        drop(store);
        fs::remove_dir_all(dir)?;
        Ok(())
    }
}

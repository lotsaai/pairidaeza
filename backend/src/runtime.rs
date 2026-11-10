use std::time::{Duration, Instant};

use eyre::{Result, bail};
use jcode_sdk::{
    ApiEvent, ConnectOptions, JcodeClient, SessionToolDefinition, ToolConfiguration, TurnStopReason,
};
use serde_json::json;
use uuid::Uuid;

use crate::store::{Run, Store};

const TURN_TIMEOUT: Duration = Duration::from_secs(600);
const CANCEL_TIMEOUT: Duration = Duration::from_secs(10);

fn expired(turn_elapsed: Duration, cancel_elapsed: Option<Duration>) -> bool {
    turn_elapsed >= TURN_TIMEOUT || cancel_elapsed.is_some_and(|elapsed| elapsed >= CANCEL_TIMEOUT)
}

fn connect() -> Result<JcodeClient> {
    let client = JcodeClient::connect(ConnectOptions {
        client_name: "pairidaeza-backend/0.1".into(),
        request_timeout: Some(CANCEL_TIMEOUT),
        ..Default::default()
    })?;
    if !client.supports("session_tools") {
        bail!("jcode harness does not support session tools");
    }
    Ok(client)
}

fn configure(client: &JcodeClient, session: &str) -> Result<()> {
    let tool = |name: &str, description: &str, parameters| -> Result<SessionToolDefinition> {
        Ok(SessionToolDefinition {
            name: name.into(),
            description: description.into(),
            parameters: serde_json::from_value(parameters)?,
        })
    };
    client.configure_tools(session, ToolConfiguration {
        enabled: Some(vec!["note_read".into(), "note_write".into()]),
        disabled: vec![],
        custom: vec![
            tool("note_read", "Read a persistent note by key", json!({"type":"object", "properties":{"key":{"type":"string"}}, "required":["key"], "additionalProperties":false}))?,
            tool("note_write", "Write a persistent note by key", json!({"type":"object", "properties":{"key":{"type":"string"},"value":{"type":"string"}}, "required":["key","value"], "additionalProperties":false}))?,
        ],
    })?;
    Ok(())
}

pub fn start(store: &mut Store, owner_id: &str) -> Result<Run> {
    let started = Instant::now();
    let id = Uuid::new_v4().to_string();
    let client = connect()?;
    let session = client.create_session(None)?;
    store.insert(owner_id, &id, &session.session_id)?;
    tracing::info!(runId = %id, entryPoint = "start", event = "ready", durationMs = started.elapsed().as_millis() as u64);
    store.get(owner_id, &id)
}

pub fn status(store: &Store, owner_id: &str, run_id: &str) -> Result<Run> {
    let started = Instant::now();
    let run = store.recover(owner_id, run_id)?;
    tracing::info!(runId = %run_id, entryPoint = "status", event = %run.status, durationMs = started.elapsed().as_millis() as u64);
    Ok(run)
}

pub fn cancel(store: &Store, owner_id: &str, run_id: &str) -> Result<Run> {
    let started = Instant::now();
    loop {
        let row = store.recover(owner_id, run_id)?;
        let changed = match row.status.as_str() {
            "ready" => store.transition(owner_id, run_id, "ready", "cancelled")?,
            "running" => store.transition(owner_id, run_id, "running", "cancel_requested")?,
            _ => break,
        };
        if changed {
            break;
        }
    }
    let row = store.get(owner_id, run_id)?;
    tracing::info!(runId = %run_id, entryPoint = "cancel", event = %row.status, durationMs = started.elapsed().as_millis() as u64);
    Ok(row)
}

pub fn run(store: &mut Store, owner_id: &str, run_id: &str, prompt: &str) -> Result<String> {
    let _lock = store.lock(run_id)?;
    let row = store.get(owner_id, run_id)?;
    if row.status != "ready" {
        bail!("run is not ready; interrupted runs are not replayed");
    }
    let client = connect()?;
    client.attach_session(&row.session_id)?;
    configure(&client, &row.session_id)?;
    let events = client.events(Some(&row.session_id));
    if !store.transition(owner_id, run_id, "ready", "running")? {
        bail!("run is no longer ready");
    }
    let started = Instant::now();
    tracing::info!(runId = %run_id, entryPoint = "run", event = "started");
    let result = (|| -> Result<(String, Option<TurnStopReason>)> {
        client.send_message(&row.session_id, prompt, vec![], None)?;
        let mut parts: Vec<(Option<String>, String, bool)> = Vec::new();
        let mut stopped = None;
        let mut cancel_sent: Option<Instant> = None;
        loop {
            if expired(started.elapsed(), cancel_sent.map(|when| when.elapsed())) {
                if cancel_sent.is_none() {
                    client.cancel(&row.session_id)?;
                }
                bail!("turn or cancellation deadline exceeded before TurnDone");
            }
            if cancel_sent.is_none() && store.get(owner_id, run_id)?.status == "cancel_requested" {
                cancel_sent = Some(Instant::now());
                client.cancel(&row.session_id)?;
            }
            let event = match events.next_timeout(Duration::from_secs(1)) {
                Some(event) => event,
                None if client.is_closed() => bail!("harness disconnected before TurnDone"),
                None => continue,
            };
            match event {
                ApiEvent::ToolCall {
                    session_id,
                    call_id,
                    name,
                    input,
                } => {
                    let (output, error, duplicate) =
                        store.tool(owner_id, &session_id, &call_id, &name, &input)?;
                    tracing::info!(runId = %run_id, entryPoint = "run", event = if duplicate { "tool_deduplicated" } else { "tool_applied" }, durationMs = started.elapsed().as_millis() as u64);
                    client.submit_tool_result(&session_id, &call_id, &output, error)?;
                }
                ApiEvent::TextDelta {
                    text, message_id, ..
                } => {
                    if let Some(part) = parts
                        .iter_mut()
                        .rev()
                        .find(|(id, _, done)| *id == message_id && (id.is_some() || !*done))
                    {
                        part.1.push_str(&text);
                    } else {
                        parts.push((message_id, text, false));
                    }
                }
                ApiEvent::TextReplace {
                    text, message_id, ..
                } => {
                    if let Some(part) = parts
                        .iter_mut()
                        .rev()
                        .find(|(id, _, done)| *id == message_id && (id.is_some() || !*done))
                    {
                        part.1 = text;
                    } else {
                        parts.push((message_id, text, false));
                    }
                }
                ApiEvent::TextDone { message_id, .. } => {
                    if let Some(part) = parts
                        .iter_mut()
                        .rev()
                        .find(|(id, _, done)| *id == message_id && (id.is_some() || !*done))
                    {
                        part.2 = true;
                    }
                }
                ApiEvent::TurnStopped { reason, .. } => stopped = Some(reason),
                ApiEvent::TurnDone { .. } => {
                    let text = parts
                        .iter()
                        .rev()
                        .find(|(_, text, done)| *done && !text.is_empty())
                        .map(|(_, text, _)| text.clone())
                        .unwrap_or_else(|| parts.into_iter().map(|(_, text, _)| text).collect());
                    return Ok((text, stopped));
                }
                ApiEvent::Error { .. } => bail!("harness reported a turn error"),
                _ => {}
            }
        }
    })();
    match result {
        Ok((text, stopped)) => {
            let terminal = match stopped {
                None => "succeeded",
                Some(TurnStopReason::Interrupted) => "cancelled",
                Some(_) => "failed",
            };
            store.finish(
                owner_id,
                run_id,
                terminal,
                (terminal == "succeeded").then_some(text.as_str()),
            )?;
            let status = store.get(owner_id, run_id)?.status;
            tracing::info!(runId = %run_id, entryPoint = "run", event = %status, durationMs = started.elapsed().as_millis() as u64);
            if status == "succeeded" {
                Ok(text)
            } else {
                bail!("run ended with status {status}")
            }
        }
        Err(error) => {
            store.finish(owner_id, run_id, "interrupted", None)?;
            tracing::warn!(runId = %run_id, entryPoint = "run", event = "interrupted", errorCategory = "harness_or_store", durationMs = started.elapsed().as_millis() as u64);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turn_and_cancel_deadlines_are_bounded() {
        assert!(!expired(
            TURN_TIMEOUT - Duration::from_secs(1),
            Some(CANCEL_TIMEOUT - Duration::from_secs(1))
        ));
        assert!(expired(TURN_TIMEOUT, None));
        assert!(expired(Duration::ZERO, Some(CANCEL_TIMEOUT)));
    }
}

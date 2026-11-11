# ADR-001: Application-owned bot runtime with Rig first

## Status

Accepted.

## Date

2026-11-10

## Context

Pairidaeza's backend is a proof of concept. The existing jcode integration does not establish the architecture we want to keep.

The application has two execution contexts:

- Control-plane bots that perform application-service operations.
- Workers that operate on file systems and perform coding tasks, with UI clients that control and observe those tasks.

A UI client is not necessarily the machine that executes a task. Both contexts need application-owned contracts rather than contracts inherited from a particular agent library.

We compared Rig, Tin, Pi, OMP, jcode, and Zerostack. Rig is the chosen starting point for its native Rust integration and reusable agent framework. This is a fit decision, not a demonstrated reliability or performance advantage over Tin.

## Decision

Create a dedicated `bot-runtime` crate and separate implementation-specific crates. Start with `bot-runtime-rig`.

The abstraction follows what Pairidaeza needs in its own code. It does not reproduce Rig's API or attempt to standardize every feature of the compared libraries.

- Application code depends on `bot-runtime` contracts. Rig types, builders, hook interfaces, and provider-specific details remain inside `bot-runtime-rig`.
- Keep one-shot model operations distinct from iterative, tool-using bot runs. A title, summary, or other bounded completion must not require an agent loop.
- Define application events and results from caller needs. Support streaming and non-streaming consumption without exposing framework event enums as the internal protocol.
- Keep model invocation, tool dispatch, deferred tool outcomes, and input and event recording as distinct integration boundaries where the application needs them.
- Keep host responsibilities outside the library adapter. The host owns authorization, credentials, persistence, scheduling, workspace access, and tool implementations.
- Port required plugin behaviors against those application boundaries. Direct compatibility with Pi or OMP plugins is not a goal.

Do not add speculative adapters or a comprehensive capability system before callers need them. Unsupported behavior must be explicit rather than silently approximated.

## Durability is a separate choice

Choosing Rig for bot execution does not choose a durable execution provider. Local execution and Restate-backed execution are separate from the choice of bot library.

Bubo, the Tin reactor prototype in Slipstream, demonstrates local and Restate-backed execution with separate boundaries for model calls, tool calls, deferred outcomes, and recorded inputs and events. Tin is the more production-ready successor and retains those boundaries. We do not need to invent those boundaries because we start with Rig.

This precedent does not establish that the current Tin repository ships a Restate adapter. This decision does not select or implement Restate for Pairidaeza.

The application must distinguish provisional streamed output from durable milestones and terminal results. Durable replay alone does not make external tool effects exactly once. Retry safety and idempotency remain responsibilities of the host and tools.

## Enforcement and data ownership

Authorization must happen before an effect. Required redaction must happen before sensitive data reaches model inputs, client events, logs, traces, or persistence. A post-tool hook alone is insufficient if another output path has already received the raw result.

Application session data must not depend on Rig's serialization format. Any adapter-specific checkpoint must remain explicitly adapter-specific rather than promise portability between runtimes.

## Alternatives considered

- **Tin.** A viable native Rust alternative with independently usable reactor, model/provider, and plugin crates. It supports one-shot calls and streaming and non-streaming consumption. Its provider transforms are relevant capabilities, not gaps to dismiss. Rig first does not imply Tin requires its harness or daemon, lacks the integration boundaries above, or is fundamentally less capable.
- **Pi and OMP.** Useful references for coding workflows and plugin behavior. Starting with either adds a JavaScript or Bun execution boundary to the Rust backend. Their contracts are not the intended internal application API.
- **jcode.** Explicitly rejected as the runtime to retain. The existing integration is POC code, not a requirement for the replacement design.
- **Zerostack.** A complete coding application is not required to embed bot execution. Starting with Rig avoids adopting that application's host architecture.

Retrieval and vector-search facilities remain optional integrations. Crumbs is separate from the runtime choice, not a missing Tin capability that requires choosing Rig.

## Consequences and limits

The application owns adapter maintenance and the contracts it exposes. Runtime replacement should not require application callers to adopt another framework's types, but equivalent behavior across implementations still requires verification.

Rig release compatibility, plugin-behavior parity, coding-worker behavior, redaction across all output paths, and crash recovery remain implementation acceptance work. The source investigation does not prove those properties end to end.

This ADR records the accepted direction only. It does not create the crates, migrate callers, remove the existing jcode integration, select a Rig release, or change dependencies.

## References

- [Rig source](https://github.com/0xPlaygrounds/rig).
- [Rig documentation](https://rig.rs/docs).
- Local Tin source, `crates/tin-reactor/src/runtime.rs` and `crates/tin-llmapi/src/client.rs`.
- Local Slipstream source, `server/crates/bubo/src/executor.rs` and `server/crates/bubo/src/remote/context.rs`.
- Local Crumbs source for the independent retrieval integration.

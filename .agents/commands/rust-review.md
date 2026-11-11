You are performing a strict, evidence-based Rust code review of this repository.

Your job is to find real problems in architecture, module boundaries, API design, ownership, error handling, async behavior, the guest-call guard, documentation, unsafe code, and long-term maintainability.

Missing a meaningful issue is worse than spending extra context. Be exhaustive.

Do not be polite. Do not pad with praise. Do not soften clear criticism. Be professional, direct, specific, and grounded in evidence.

---

## Source of truth and precedence

Review against all of the following, in this exact order:

1. Repository-specific rules in `AGENTS.md`
2. The actual module boundaries and architecture of this repository
3. The `write-rust` skill (shared authoring rules for this repo family)
4. The `rust-expert` skill and its references
5. Upstream Rust API/style conventions

Do not fetch internet sources during review. Perform the review in this session.

If guidelines conflict, the higher-priority source wins.

Examples:
- If a general guideline would allow a pattern that `AGENTS.md` forbids, it is still a violation.
- If a general Rust idiom conflicts with a module-boundary rule in this repo, the module-boundary rule wins.
- If generic lint guidance prefers suppression, but this repo requires fixing warnings instead of suppressing them, then lint suppression is still a finding here unless explicitly justified by repository rules or generated code.

Never recommend a refactor that violates a higher-priority rule in order to satisfy a lower-priority one.

---

## Review posture

- Be strict.
- Be adversarial toward weak design.
- Be concrete and evidence-based.
- Prefer architectural, semantic, and API-shape issues over style nits.
- Do not cargo-cult guidelines. Explain why a rule applies in this specific code.
- Do not invent problems. If uncertain, say exactly what is unknown.
- Distinguish clearly between:
  - **must fix**: clear violation, correctness risk, architectural break, unsoundness, or strong repo-rule violation
  - **should fix**: significant design/API/idiom issue with real maintenance or usability cost
  - **consider**: worthwhile improvement, but not clearly required
- If reviewing a diff, review the changed code first, then inspect surrounding code needed to judge it correctly.
- If reviewing the whole repo, map the modules before diving into local findings (`specs/tech-architecture/tech-stack.md` is the architecture map; verify it against live code, don't trust it blindly).

---

## Primary mission

Find and explain violations in these areas:

1. **Repository architecture and module boundaries**
2. **Rust API and type design**
3. **Ownership, borrowing, and unnecessary cloning**
4. **Error handling and panic behavior**
5. **Guard coverage and async discipline**
6. **Documentation and public API quality**
7. **Unsafe code, FFI, and soundness**
8. **Trait design and missed trait opportunities**
9. **Testability and resilience**
10. **Performance-relevant API/path problems**

---

## Repository-specific rules you must enforce first

### 1) Module roles and dependency boundaries

One crate, module-level boundaries. Treat these as hard constraints:

- `main` is the face: clap parsing, report rendering, exit codes, eyre conversion at the edge. It calls `HostConfig::from_str`, `Host::load`, `host.outcomes()` and nothing else.
- `host` is the kernel: load, dispatch, watcher delivery, outcomes. It never renders output or parses input.
- `linker` is the sole capability gate. Grant enforcement happens by import linking, plus the `watch` flag at the event queue — the one designed exception, because the watcher interface is guest-exported.
- `guard` owns the clock (timeout default + override) and the epoch ticker. No per-call timeouts, no second clock anywhere.
- `config` owns the TOML schema and all fail-closed validation. Downstream layers trust typed entries.
- `host_fns` lanes are thin: reach the granted scope, delegate to the backend, pass errors through. No validation, no normalization, no business logic.
- `kv` speaks WIT: helpers and trait methods return `types::Error`; only `Redb::new` returns the crate `Error`.
- `error` owns the one `Error` enum, the `Result` alias, the `Wasmtime` bridge, and `chain`.

Hard violations:
- `main` touching `linker`, `guard`, `host_fns`, `registry`, or wasmtime directly
- capability checks outside `linker` (other than the `watch` queue flag)
- guest call sites without `guard::bounded`, stores without `guard::arm`
- validation or normalization in lanes or storage
- `eyre`/`anyhow` anywhere except `main.rs`
- a second error enum or `Result` alias in any child module
- the host interrogating a plugin after `init` (reads must come from host-owned snapshots)

Always check dependency direction and responsibility placement, not just local code style.

Crate boundaries (hard rules, live now): `hokusai-host` → `hokusai-keyvalue` + `hokusai-keyvalue-redb`; `hokusai-keyvalue-redb` → `hokusai-keyvalue`; `hokusai-keyvalue` → nothing internal. Flag any reversed or sideways internal dependency, any second backend inside the redb crate, any logic in `hokusai-workspace-hack`, and any hand-edit of its manifest block (regenerate with `mise hakari`). Each WIT world stays one crate: new worlds arrive with new crates, never inside an existing one. Plugins (when they appear) are one crate each under `plugins/`, own world, `wasm32-wasip2`; the host loading one by path is the only relationship allowed. Split pressure (report as `consider`, not a violation): a module with two reasons to change is a crate waiting to happen — say so with the proposed boundary.

### 2) No optionality / no fallbacks

Flag any code that weakens required behavior to "make it pass":

- silent defaults hiding missing required state
- introducing `Option` where absence is not a real domain concept
- returning early with `Ok(())` to avoid real work
- swallowing or downgrading errors
- hidden fallback behavior not explicitly required
- weakening tests or behavior just to go green
- feature flags / env gates / `#[ignore]` used to hide failures

This repo explicitly forbids "softening" behavior to make code pass.

### 3) Guard coverage is non-negotiable

Treat these as top-tier review items:

- every guest call site — instantiate, init, export dispatch, watcher callbacks, and any future one — runs under `guard::bounded`
- every `Store` goes through `guard::arm`; the `Ticker` stays co-owned with the engine
- expiry reports through `guard::expired` so wording stays uniform; no ad-hoc timeout messages
- the timeout knob (`HOKUSAI_CALL_TIMEOUT_MS` + 30s default) lives in `guard` only

Aggressively flag:
- `call_async`, `instantiate_async`, or any wasmtime invocation on a guest path that bypasses `bounded`
- `Store::new` without a following `arm`
- a second clock, per-call timeout, or retry-with-timeout wrapper anywhere else

### 4) Watcher delivery contract is non-negotiable

- `drain_watcher` takes the whole batch off the queue before delivering anything. A callback's own writes arrive on the next drain, never recursively.
- One pass per call. Never drain-until-empty: a self-writing watcher never empties the queue.
- A component without the watcher export drops its batch silently — supported shape, not an error.
- Bucket mismatch is refused, never delivered to the wrong watcher.

Flag: delivery before taking the batch, loops until the queue is empty, requeue-on-failure (explicitly rejected ceiling), or cross-bucket delivery.

### 5) Validate once, in the right layer

Enforce the repository's validation split:

- **Face (`main`)**: no validation of its own; calls `HostConfig::from_str` and reports.
- **Config boundary (`from_str`)**: the single semantic validation point — shape, unknown keys, empty plugin list, grant-without-store, duplicate names/stores.
- **Host/linker/guard**: load-shape only — component presence, linkability, declared-id uniqueness.
- **Lanes/storage**: none. Serve what was granted; store what is handed over.

Flag:
- validation repeated downstream of `from_str`
- semantic checks in `main`, lanes, or storage
- normalization after the config boundary
- `Option` or silent failure where the domain should return a real error

### 6) Configuration ownership

- The TOML schema and fail-closed validation belong to `config::HostConfig`; file reading and `--config` handling belong to `main`.
- The `store` path IS the store grant; `grants` names extra interfaces; per-entry `config` seeds the in-memory namespace only.
- New entrypoints become `hokusai-host` subcommands, not new binaries with new loaders.

Flag:
- config parsing outside `config` + `main`
- a second config schema, a second loader, or a new binary with its own flags
- per-entry `config` treated as durable (it reseeds every load)

### 7) Error boundaries

Enforce the repository error model:

- one `Error` type and one `Result<T>` alias at the crate root, re-exported from `lib.rs`; children import `crate::{Error, Result}`
- library uses `thiserror`; `main` uses `eyre`/`color-eyre` at the edge only
- `#[from]` for transparent conversions, `#[source]` for contextual variants; variants name entry + phase and carry typed context (paths, ids, names)
- guest-facing WIT `error` variants pass through untranslated; `build_linker` returns `Wasmtime` directly
- no errors that are just a labeled string — `Other(String)` and operation-label-only variants are review failures
- never store `err.to_string()` as the cause when the original source can be preserved (the `Wasmtime` newtype exists for this)

Flag:
- ad hoc per-module error types or `Result` aliases
- `anyhow`/`eyre` in library code
- source-erasing conversions, stringly wrappers, generic operation labels, manual call-site locations instead of typed context
- `map_err` chains that could be `#[from]` conversions

### 8) Capability gating

- Adding a capability means: extend `wit/host.wit` + add a `Grant` name + add a linker arm. Never a change to a plugin, never a check elsewhere.
- `batch`/`atomics`/`cas`/`watch` require a `store` file; the config refuses them alone so the linker never sees an inconsistent entry.
- Handler `access-denied` arms are unreachable-by-construction backstops, not a permission system. Do not build on them, do not add more.

Flag: grant checks outside `linker` (+ `watch` queue flag), capabilities reachable without a grant, config/linker disagreement on what a grant means.

### 9) Linting and code quality

This repo is strict:
- fix warnings instead of suppressing them
- no `#![allow(...)]` or `#[allow(...)]`
- strict mode: `-D warnings`
- `mise format` must be clean; warnings count as not complete
- if Rust code changed, `mise run --force test` must also be clean
- zero exit status is not enough if the output still contains warnings — read each step

Flag:
- lint suppressions in normal code
- dead code left around
- warning-prone code that should be fixed instead
- dirty verification runs that still show warnings or errors
- `dbg!`, debug `println!`, accidental logging noise

### 10) Other explicit repository rules

Flag all of the following when found:
- `.unwrap()` / `.expect()` in production paths
- missing doc comments on public items, missing `//!` on public modules
- banned vocabulary in comments, docs, names, or strings: "seam", "spine", "streak", "pillar", "load-bearing" (say the boundary, dependency, or failure mode directly); "birth"/"born" → "join"/"membership"
- hardcoded credentials or secrets
- spec/invariant ids from planning docs in comments, test names, assert messages, or error strings
- loading/linking/execution logic moved into `main`
- `&String`, `&Vec<T>`, `&PathBuf` in public signatures

### Accepted exceptions (do not misreport)

- `Grant::Log` is a stable name with no gating behind it (R6): `log` links unconditionally. Not a missing check.
- `Error::Expired(String)` is preformatted at each call site through `guard::expired`: uniform wording by construction, not a stringly wrapper.
- No TTL sweep: expired-but-untouched keys keep their bytes. Ceiling is disk, not correctness.
- No watcher requeue: a failed callback loses the rest of the batch. Deliberate.
- Duplicate declared plugin ids abort the whole load while every other entry failure is recorded. Deliberate asymmetry (config error spanning entries).
- `tests/guard.rs` holds exactly one test with a documented `unsafe set_var`: the timeout override is process-wide by design.

---

## General Rust lenses (shared core, not a fork)

Apply `write-rust` §§1–8 and `rust-expert` rigorously; do not re-derive them here. The reminders below are hokusai-frequent shapes, not a second rulebook:

- **Cohesion**: 3+ traveling params → context struct + methods; private-pure-single-caller → assoc fn; IO → method on the dependency owner.
- **Ownership**: borrow over clone; `mem::take`/`replace` before cloning out of `&mut`; concrete > generics > hidden `dyn`.
- **API shape**: borrowed views, newtype ids, `typed-builder` for complex construction, `Debug` minimum on public types.
- **Async**: `Send` futures, no locks across `.await`, yield points in CPU loops, `join!`/`JoinSet` for independent work.
- **Traits**: missing `Display`/`Default`/`FromStr`/`TryFrom`/`AsRef`/`IntoIterator` where semantics are real; `Deref` only for smart pointers.
- **Unsafe**: high severity by default; needs a real low-level reason, contained surface, documented safety reasoning.

---

## High-signal anti-patterns to hunt for

Actively search for and review these patterns in context:

### Boundaries / gating / guard
- `call_async`, `instantiate_async`, `func.call` outside `guard::bounded`
- `Store::new` without `guard::arm`
- `eyre`, `anyhow`, `bail!`, `wrap_err` outside `main.rs`
- `enum .*Error`, `type Result` outside `error.rs`
- grant/capability checks outside `linker.rs` (other than the `watch` flag)
- `drain_watcher` callers looping until the queue is empty
- host reads of plugin state that bypass the load-time snapshots

### Error handling / fallback smells
- `unwrap(`, `expect(`
- `todo!(`, `unimplemented!(` in production paths
- `Ok(())` early exits that skip real work
- `Option` replacing a real error contract
- `.to_string()` stored as an error cause; `map_err(|_| ...)` losing sources
- `Other(String)`, `message: String` variants, operation-label-only enums

### Config / validation
- struct deserializing config without `deny_unknown_fields`
- validation repeated downstream of `from_str`
- `serde` parsing outside `config` + `main`

### API ergonomics / ownership
- `&String`, `&Vec<T>`, `&PathBuf`, `&Box<T>` in signatures
- `.clone()` to satisfy the borrow checker; `to_string()` at boundaries
- `Arc<dyn`, `Box<dyn`, `Rc<dyn` in public APIs
- long constructor arg lists; missing builders

### Async / unsafe / lint / docs
- `Rc<`, `RefCell<` held across `.await`; `Mutex`/`RwLock` across `.await`
- `unsafe` without safety reasoning; `transmute`, raw-pointer conversions, unchecked indexing
- `#[allow(`, `#![allow(`, suspicious `#[expect(`
- missing docs on public items; missing `//!` on public modules; glob re-exports
- `dbg!(`, `println!` in non-test code
- banned vocabulary (`seam`, `spine`, `streak`, `pillar`, `load-bearing`, `birth`, `born`) in comments, docs, names, or strings

---

## Review workflow

Follow this process in order.

### Step 1: Map the modules
- identify each module's role from `AGENTS.md` and `specs/tech-architecture/tech-stack.md` (verify the doc against live code)
- inspect dependency direction via `use` statements and module roots
- note face vs kernel vs lanes vs storage

### Step 2: Audit boundary compliance
Check whether the actual dependency graph and module responsibilities match `AGENTS.md`.

### Step 3: Audit public APIs first
Inspect public types, constructors, traits, and major module boundaries before spending time on local style details.

### Step 4: Search for high-signal smells
Search for the patterns above and inspect each hit in context.

### Step 5: Judge each smell against the rules
Do not report grep hits mechanically. Evaluate each one in context and decide whether it is:
- real violation
- acceptable tradeoff
- false positive

### Step 6: Produce an evidence-based report
Every finding must have a precise location and a clear rationale.

---

## Output format

Produce the review in the following exact structure.

### 1. Executive summary
Give **5–15 bullets** with the highest-impact problems first.

Rules:
- lead with architecture, correctness, guard coverage, soundness, and public-API issues
- do not bury major violations under minor style notes
- do not praise the code

### 2. Severity rubric used
Briefly restate how you applied:
- `must fix`
- `should fix`
- `consider`

### 3. Findings grouped by topic
Do **not** use a markdown table for findings. Tables hide the narrative that connects related issues.

Group related findings under topic headings. Prefer these headings when applicable:
- `Architecture / module boundaries`
- `Capability gating`
- `Guard coverage / async`
- `Watcher delivery`
- `Error handling / fallbacks`
- `Validation / configuration ownership`
- `API shape / documentation`
- `Domain modeling / idiomatic Rust`
- `Testing / resilience`
- `Unsafe / panic / lint`

Use one primary topic per finding. If a finding spans topics, place it under the strongest governing rule and cross-reference the other topic in the finding body.

Within each topic, use dense bullets, not rows:

```markdown
#### Guard coverage / async
- **F1 — must fix — guard coverage**
  - **Rule reference(s):** `AGENTS.md: Guard Coverage`
  - **Location:** `crates/hokusai-host/src/host.rs:237`, item `Host::drain_watcher`
  - **Evidence:** `on_set.call_async(&mut *store, &params, &mut []).await`
  - **Problem:** The watcher callback bypasses `guard::bounded`.
  - **Why it is wrong:** A hanging callback holds the drain forever with no diagnostic; the guard exists so a non-returning guest costs its own entry.
  - **Recommended refactor:** Wrap the call in `guard::bounded` and report `guard::expired("on-set")` on `None`.
  - **Scope:** `local`
  - **Confidence:** `high`
```

For each finding include all of the following:
- **ID**: `F<n>`
- **Severity**: `must fix` / `should fix` / `consider`
- **Category**: one of `architecture`, `module boundaries`, `capability gating`, `guard coverage`, `watcher delivery`, `validation`, `API shape`, `domain modeling`, `idiomatic rust`, `ownership/borrowing`, `trait design`, `error handling`, `panic behavior`, `async/concurrency`, `unsafe/soundness`, `documentation`, `testing/resilience`, `performance`
- **Rule reference(s)**: cite the governing source precisely, e.g. `AGENTS.md: Guard Coverage`, `AGENTS.md: Validate once`, `write-rust: §1`, `rust-expert: own-borrow-over-clone`
- **Location**: file, item, line(s) if available
- **Evidence**: short quote or precise description of the code
- **Problem**: what is wrong
- **Why it is wrong in Rust/repo terms**
- **Recommended refactor**: concrete, not vague
- **Scope**: `local` or `cross-cutting`
- **Confidence**: `high`, `medium`, or `low`

### 4. Repository-rule violations map
Create a dedicated section mapping findings directly to these repo rules:
- module boundaries
- no optionality / no fallbacks
- guard coverage
- watcher delivery contract
- validate once
- configuration ownership
- error boundaries
- capability gating
- no lint suppression
- no unwrap/expect in production
- public docs

If a rule has no violations in the reviewed scope, say so explicitly.

### 5. Free-function abuse audit
List every suspicious free-standing function you encountered and classify it as one of:
- `inherent method`
- `trait impl`
- `newtype + impl`
- `builder/type-state API`
- `acceptable free function`

For each one, explain **why**.

Important:
- do not automatically convert generic/stateless helpers into methods
- only move behavior onto a type when there is a natural receiver or invariant owner

### 6. Trait opportunities and trait misuse
List missing, incorrect, or suspicious trait implementations.

Especially call out:
- `Debug` / `Display`
- `Default`
- `Eq` / `Hash`
- `Ord` / `PartialOrd`
- `FromStr` / `TryFrom`
- `AsRef`
- `IntoIterator`
- misuse of `Deref`

### 7. API and ownership audit
Summarize cross-cutting issues such as:
- primitive obsession
- stringly typed APIs
- borrowed-type violations (`&String`, `&Vec<T>`, etc.)
- clone abuse
- wrapper-heavy public APIs
- visible `dyn Trait` usage that should be concrete/generic/hidden

### 8. Guard / async / data-flow audit
Summarize violations or risks around:
- unguarded guest call sites
- unarmed stores
- second clocks or per-call timeouts
- drain-until-empty loops
- `!Send` async paths
- missing yield points in long CPU-bound async work

### 9. Unsafe / panic / lint / docs audit
Summarize:
- unsafe usage and soundness risks
- panic-prone public APIs
- lint suppression
- missing doc comments
- missing module docs
- glob re-exports
- magic values without explanation

### 10. Top 10 refactors
Rank the highest-value refactors by:
- impact
- difficulty
- risk
- whether they improve architecture, idiomatic Rust, or both

Make this prioritization actionable.

### 11. False positives / keep as-is
Explicitly list suspicious-looking code that is actually justified.
This section is required.

---

## Review style constraints

- Be strict.
- Be concrete.
- Use evidence.
- Prefer architecture and semantics over taste.
- Do not praise the code.
- Do not hedge unless uncertainty is real.
- If uncertain, state exactly what is unknown.
- Do not recommend changes that violate `AGENTS.md`.
- Do not report low-value nits unless they connect to a broader maintainability or API issue.
- When you cite a rule, explain its relevance instead of just naming it.

Your job is not to be agreeable. Your job is to prevent bad Rust and architectural drift from entering the codebase.

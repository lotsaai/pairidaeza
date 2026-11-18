# AGENTS.md - Pairidaeza

Pairidaeza combines an NSH TSX interface with Rust native bindings, a browser server, and a bearer-token API. Authentication uses real Zitadel identities; application documents remain fixture-backed.

## Crate Roles & Boundaries

### Terminology

- **Face**: TSX UI and `app` native bindings present the application; `webui` and `pairidaezad` executables load configuration and serve their respective HTTP interfaces.
- **Browser gateway**: `webui` owns browser login, callbacks, sessions, server-held tokens, and authenticated API forwarding.
- **API**: `pairidaezad` owns bearer-token verification, application operations, and fixture-backed document state.
- **Contracts**: `protocol` owns shared API data types, serialization, schemas, and contract-level validation declarations.
- **Observability**: `telemetry` owns shared provider initialization and shutdown.

| Crate | Role | Dependencies Allowed |
|---|---|---|
| `app` | NSH native bindings and native authentication | NSH/platform and authentication libraries; no server implementation crates |
| `webui` | Browser HTTP server, OAuth, PostgreSQL sessions, asset serving, API forwarding | `protocol`, `telemetry`, HTTP/authentication/storage libraries |
| `pairidaezad` | API HTTP server, JWT validation, application state | `protocol`, `telemetry`, HTTP/authentication/application-storage libraries |
| `protocol` | Shared API contracts and schemas | Serialization, schema, and validation libraries; no other workspace crates |
| `telemetry` | Shared tracing, metrics, logs, and shutdown | Observability libraries; no other workspace crates |

### Dependency Rules (STRICT)

1. **Faces use API contracts, not server internals.** TSX and `app` call HTTP/native interfaces; they must not depend on `webui` or `pairidaezad` implementations.
2. **Browser and API servers remain independent.** `webui` and `pairidaezad` must not depend on each other as Rust crates. Forward browser API requests over HTTP using shared `protocol` contracts.
3. **Contracts have no upward dependencies.** `protocol` must not import `app`, `webui`, `pairidaezad`, or `telemetry`, load configuration, connect to storage, or implement authentication flows.
4. **Observability has no upward dependencies.** `telemetry` must not import application contracts, UI, or server crates. Entrypoints initialize and shut down its providers.
5. **Browser sessions belong to `webui`.** Do not move browser cookies, token refresh, callback handling, or the PostgreSQL session store into `pairidaezad` or `protocol`.
6. **API authorization belongs to `pairidaezad`.** Browser authentication does not replace API bearer verification. Native clients must not need a browser-session record to call the API.
7. **Native authentication belongs to `app`.** Native clients use the system browser and platform callback handling; do not route native login through browser cookie sessions.
8. **Storage integrations remain distinct.** Application SQL belongs under `crates/pairidaezad/postgres/`; browser-session persistence belongs to `webui`. Do not convert the session store to application sqlc queries.

Hakari integration is deferred. Do not add a workspace-hack crate or change mise tasks as part of documentation maintenance.

## Non-negotiable Rules

### No Optionality / No Fallbacks

- **Never introduce optionality to "make it pass/work".** Do not add silent defaults, degrade required behavior to `Option`, return early with `Ok(())`, swallow errors, or otherwise mask missing configuration/state.
- **Never weaken tests to go green.** Do not "skip" by returning success early, loosen assertions, add broad retries/timeouts, or ignore errors unless explicitly instructed.
- **Never add gating/ignores without explicit instruction.** No `#[ignore]`, feature flags, env-var gates, or conditional compilation to hide failing tests or behavior changes unless the user explicitly asks for it.

### No Panics in Production Code

- **A panic is a programmer error.** Forbidden in any non-test path: `panic!`, `unreachable!`, `todo!`, `unimplemented!`, `assert!*`, `.unwrap()`, `.expect()`, indexing/slicing that can go out of bounds or split a char boundary (use `get`/`get_mut`), arithmetic that can overflow or divide by zero (use `checked_*`/`saturating_*`).
- **Instead**: return `Result` with a typed error. The dangerous `.expect()` is the one justified by an invariant enforced somewhere else — a comment, not a guarantee. If an invariant is real, encode it in a type. If it cannot be encoded, handle the failure.
- **Narrow exceptions**: test code, benchmarks, build scripts, `examples/`; poisoned-lock recovery via `.unwrap_or_else(PoisonError::into_inner)`; `const` evaluation that fails at compile time. Anything else: ask first.

### Terminology

Use standard software engineering vocabulary. Architectural metaphors are banned: never write "load-bearing", "spine", "seam", "pillar", "streak", or similar. Say the technical thing directly: "X is required by Y", "Z depends on W", "the boundary between A and B", "integration point", "failure mode".

Banned domain vocabulary with required replacements: "birth"/"born" → "join"/"membership".

### Mise Environment

If a mise task fails because a required environment variable is missing, stop that task and report the variable name. Never read or open secret files, including fnox configuration, or look for secret values through mise, fnox, or another route. Tool declarations, task scripts, and lockfile failures can be investigated without accessing secrets.

### Linting & Code Quality

- **Fix, Don't Suppress**: address all lint errors and warnings by fixing the code.
- **No `allow` Attributes**: **NEVER** use `#![allow(...)]` or `#[allow(...)]` to suppress warnings.
- **Strict Mode**: the project compiles with `-D warnings`. If it doesn't compile cleanly, it's broken.
- **Read the Tool's Output, Not the Wrapper's Exit Code**: `mise format` runs a report pass then a `--fix` pass; the aggregate exit reflects the fix pass and can mask report-pass findings `--fix` cannot resolve. A zero exit does **not** mean clean — read each step.

### Project Constraints

- Prefer TSX/TS. Do not edit `Cargo.toml` or `src/lib.rs` unless asked.
- Use codebase-memory graph tools, `ast_grep` and `ast_edit` before `grep`, `find` or `ls`. Verify indexed evidence against current source when coverage is stale or incomplete.
- Keep real authentication and profiles separate from mocked application data. Do not replace fixtures with an empty production-data implementation or mock authentication to simplify UI work.
- Use standard OAuth/OIDC libraries, including `oauth2`, rather than hand-written protocol types or flows. Do not introduce Limes, SQLite storage, or UUID v4.
- Authentication failures shown to users use one generic message. Do not expose tokens, credentials, HTTP status codes, or failure-stage details in that message.
- Use current stable dependencies. Do not downgrade to copy a reference project's versions.
- Preserve user deletions. Do not restore rejected code or introduce compatibility aliases without instruction.

## NSH docs are required reading

Do not write NSH code from memory or by analogy with React, React Native or CSS.

- Index: https://nsh.dev/llms.txt
- Full docs: https://nsh.dev/llms-full.txt. Read the relevant sections before writing or changing UI, and whenever unsure an API, element or module exists.
- Design Guides: skill `nsh-design-guides` (`references/design-guides.md`). Read in full before any visible UI change.
- Coding Guides: `.agents/skills/nsh/references/coding-guides.md`.
- Exact APIs: `.nsh/types` (generated by the NSH check step in `mise check`).
- The site follows the latest release. Verify examples against `.nsh/types` for the installed `nsh` version.
- Do not edit generated `.nsh/` files. Build output belongs in `target/`.

## Data Flow & Validation Strategy

> **CRITICAL: Validate ONCE. Do not repeat validation logic across layers.**

### Faces and transport adapters

- **Responsibility**: parse HTTP payloads, callbacks, UI input, and configuration into typed values; render responses and safe errors.
- **Validation**: reject malformed transport input. UI feedback is not a substitute for server-side authorization or semantic validation.
- **Normalization**: perform transport-specific conversion once at ingress; preserve identifiers and provider-issued claims.
- **Forbidden**: business validation copied into TSX, browser forwarding, native bindings, and API handlers independently.

### Authentication boundaries

- **Responsibility**: `webui` verifies browser OAuth transactions and manages sessions; `app` verifies native OAuth transactions; `pairidaezad` verifies API bearer tokens and authorizes application operations.
- **Validation**: retain PKCE, state, nonce, issuer, audience, signature, expiry, and identity checks required by each protocol boundary. Each independently exposed service authenticates its own incoming credentials.
- **Normalization**: carry verified identity as typed claims; qualify ownership by issuer and subject.
- **Forbidden**: treating an unverified decoded token, UI state, or browser session identifier as an authenticated API identity.

### Contracts and application operations

- **Responsibility**: `protocol` declares shared shapes and contract constraints; `pairidaezad` enforces application semantics at the operation boundary.
- **Validation**: check ownership, supported document namespace, and revision preconditions once before mutation. Shared types do not authorize a request by themselves.
- **Normalization**: construct the accepted typed operation once, then pass it downstream.
- **Forbidden**: repeating the same semantic checks in helpers or storage, or bypassing authorization because deserialization succeeded.

### Storage and fixtures

- **Responsibility**: persist browser sessions or application state and preserve data integrity.
- **Validation**: storage receives already validated operations; database constraints remain integrity safeguards, not a second business-validation implementation.
- **Normalization**: serialize and deserialize through established adapters only.
- **Forbidden**: authentication, environment loading, or duplicated business validation in query/session-store code. Never edit generated SQL bindings by hand.

## Configuration

- Entrypoints own file/environment loading and pass typed settings into their services. `pairidaezad::Config` loads API settings from `pairidaeza/backend.toml`; `webui` loads browser settings from `pairidaeza/webui.toml` in the user config directory, using the existing `confique` pattern and environment bindings.
- `protocol` and downstream operation/storage helpers must not read process environment or configuration files. `telemetry` may consume standard `OTEL_*` and logging environment settings through its observability libraries.
- Native authentication configuration is supplied through the existing mise build and NSH bindings. Never embed secrets into TSX or native application assets.
- Browser sign-in uses `PAIRIDAEZA_AUTH__CLIENT_ID` and the registered `PAIRIDAEZA_AUTH__REDIRECT_URI`. Native sign-in uses `PAIRIDAEZA_AUTH__NATIVE_CLIENT_ID` and `ai.lotsa.pairidaeza:/auth`. Both registrations must issue JWT access tokens from `PAIRIDAEZA_AUTH__ISSUER` for the project audience in `PAIRIDAEZA_AUTH__PROJECT_ID`.
- Do not introduce a CLI parser just for consistency. If adding CLI options, parse with `clap` at the owning entrypoint and pass typed settings downstream. Add subcommands for related operations rather than proliferating binaries; the existing browser and API services remain separate processes.
- Reuse `.mise/tasks/` and existing daemon dependency declarations. Do not manually duplicate builds, asset packaging, or server instances.

## Coding Standards

- **Error Handling**:
  - Each crate that defines a local error boundary must expose exactly one `Error` type and one `Result<T>` alias at the crate root (`lib.rs` or the binary root).
  - Do **not** define module-local `Result` aliases or duplicate error enums in child modules.
  - Child modules must import the crate-root `Error` and `Result`.
  - Libraries use `thiserror`; `main`/faces use `eyre`/`color-eyre` at the edge only.
  - `#[from]` for transparent conversions, `#[source]` for contextual variants. Variants carry typed context from the boundary that knows the entity. No stringly wrappers (`Other(String)` and kin fail review); never `to_string()` a source.
  - Preserve `webui`'s typed generic session-store error and result parameters. Foreign-library errors and vendored JWT errors are distinct external boundaries, not permission to add parallel application error enums. Do not invent a local error type for infallible contract declarations.
- **Builders**: use `typed-builder` for non-trivial request/configuration types. No long constructor arg lists.
- **Simplicity**: boring over clever; deletion over addition.
- **Naming**: `UpperCamelCase` types and variants, `snake_case` fns/modules/variables, `SCREAMING_SNAKE_CASE` consts. Preserve registered callback URIs, protocol field names, and the exact package name in `nsh.json`; do not guess spellings.
- **Exports**: keep modules private and expose named public items through explicit re-exports. Do not add `pub mod` or glob re-exports.
- **Testing**: follow adjacent Rust unit-test modules and existing integration tests. Application database tests use isolated PostgreSQL `test-context` fixtures; the browser session store retains its separate integration pattern. UI tests use the NSH harness, which owns windows and cleanup. Keep mocked application documents separate from real-provider authentication tests. Do not add bespoke test tasks, ignored tests, or custom app launchers.

These are change/review requirements, not a claim that every existing module already complies. Do not perform unrelated migrations while implementing a scoped request.

## Development Workflow (Mise)

**ALWAYS** use `mise` tasks for development. Only run direct toolchain commands if no `mise` wrapper exists.

Run `mise install` after changing the project's tool configuration.

**NEVER** run "targeted" tests, the cost is not the test it's the compilation of the modules.
**NEVER** run `cargo test`, it is not a win, it has the opposite outcome.

| Task | Description |
|---|---|
| `mise format` | Run HK's lint and fix steps. Read the report and fix passes. |
| `mise verify` | Run HK checks and the host's verification suites through `check` and `test`. |
| `mise test` | Run Rust, desktop, browser, and Android verification on Linux; Rust, desktop, and iOS on macOS; Rust and desktop on Windows using native PowerShell. |
| `mise run test:mobile` | Run Android verification on Linux or iOS verification on macOS. |
| `mise run test:desktop` | Run host desktop UI and native sign-in checks, plus non-rendered model and binding tests. |
| `mise run test:web` | Run browser UI journeys and real-provider browser and native auth regressions. |
| `mise run test:android` / `mise run test:ios` | Run native sign-in initiation, account, API, and touch UI checks on the selected mobile target. |
| `mise run test:rust` | Run workspace Rust tests with nextest. |
| `mise run --force test` | Force a fresh full test run (bypass cache). |
| `mise check` | Run hk checks, including NSH checking. |
| `mise build` | Build through the existing debug-build task. |
| `mise run dev:desktop` | Run the packaged desktop app in the foreground. |
| `mise run dev:ios` / `mise run dev:android` | Run the app on an iOS simulator or an Android device or emulator. |
| `mise run dev:web` | Run `webui` with development assets. Does not launch a browser. |
| `mise run dist:webui` | Bundle the host's release browser server and web assets under `target/dist/webui/`. |

### Run the app and services

- For a managed browser run, use `mise daemons start webui`, then open `http://127.0.0.1:17811/`. The `webui` daemon starts or reuses `api`. The defaults are port 17811 for `webui` and 17810 for `api`. Both expose `/healthz`. Inspect their logs with `mise daemons logs api webui`.
- Browser sessions need PostgreSQL. Start the existing service with `docker compose up -d --wait postgres`. Create the configured database with SQLx (`sqlx database create` with `DATABASE_URL` set to `PAIRIDAEZA_DATABASE_URL`). The development database is `pairidaeza_dev` by default. `webui` creates its session tables at startup. Fixture application data needs no seed.
- Desktop and mobile launch tasks start or reuse `api`. Desktop packages the app when its inputs change. Use `mise watch dev:desktop` to relaunch after edits, but finish any sign-in first: restarting loses the pending authentication transaction. Close other Pairidaeza instances before testing the shared native callback. The macOS launch task registers the packaged app with Launch Services. Linux requires `xdg-mime` on `PATH`.
- Start an iOS simulator or connect an Android target before running its task. Android needs `adb` on `PATH`. `dev:android` sets up `adb reverse` for a loopback API URL. For Android tests using the default local API, set up `adb reverse tcp:17810 tcp:17810` first.
- `dist:webui` produces a `webui` executable and a `public/` directory. Build for the deployment host and keep the two together. Run `./webui` from the bundle directory, or set `PAIRIDAEZA_WEB_DIST` to the assets directory. The API runs separately.
- For local telemetry collection, the mise defaults send OTLP over HTTP/protobuf to `http://127.0.0.1:4318`. Run a collector there or configure the endpoint and protocol with `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_PROTOCOL`.

### Verification prerequisites

- Keep `test` and `test:mobile` as platform-aware scripts, not dependency lists. Run selected suites sequentially because NSH targets share build output. Attempt every selected suite and return failure if any suite fails. Windows verification uses native PowerShell.
- `test:web` uses managed `webui`, `api`, and `webdriver` daemons. It needs the PostgreSQL setup above, Chrome or Chromium, and a matching mise-managed ChromeDriver on port 17812. The Zitadel test account must allow password sign-in without an interactive second factor. The task requests `TEST_USER`, `TEST_USER_EMAIL`, and `TEST_PASSWORD` through mise. NSH arguments like `--trace` apply to UI journeys, not nextest.
- Native sign-in tests that record an outgoing URL prove initiation, not that the OS opened a browser or delivered a callback. Verify callback delivery separately in the packaged app. Non-rendered tests do not prove native layout or system navigation.
- CI provisions runner prerequisites and calls `mise verify`. Do not duplicate HK, builds, or suite selection in workflow YAML. Reuse the Compose database and SQLx rather than installing another PostgreSQL. Use unversioned hosted runner labels. Leave CI changes local for review until the user explicitly authorises publishing.

### Regenerate application SQL bindings

Keep queries in `crates/pairidaezad/postgres/queries/` and SQLx migrations in `crates/pairidaezad/postgres/migrations/`. After changing either, run `mise run generate:sql:pairidaezad`. `sqlc.json` configures the Rust generator for `deadpool-postgres`. Keep browser-session migrations and persistence separate.

**IMPORTANT**: After changes, **ALWAYS** run:
1. `mise format`
2. If Rust code was modified: `mise run --force test`

For UI changes, complete the NSH check/build/test/run loop using the existing mise tasks, read build warnings, and inspect the actual rendered result. Do not invoke `nsh` directly or use `mise exec --` to bypass tasks. Never select Cargo packages with `-p`; retain workspace-wide feature resolution. Do not reconfigure desktop development as a daemon.

## Agent Guidelines

- Do not import server implementations into `app` or TSX.
- Do not make `webui` and `pairidaezad` depend on one another as Rust crates.
- Do not add application, server, storage, or environment dependencies to `protocol`.
- Do not make `telemetry` depend on application crates.
- Do not move browser sessions or browser token management into the API or contracts.
- Do not replace API bearer verification with browser-session trust.
- Do not make native login depend on browser cookies.
- Do not merge application SQL generation and browser-session storage.
- Read current source and required NSH docs before editing. Reuse existing patterns and report evidence, not assumed behavior.
- Keep changes scoped; migrate affected callers, contracts, tests, and documentation together.
- Preserve security checks, typed error sources, and user-visible accessibility.
- **When adding an API operation**: define its shared contract in `protocol`, authenticate and authorize at the API boundary, and update the OpenAPI description and affected clients.
- **When adding UI/native behavior**: prefer TSX; use `app` only for required platform bindings, verify generated declarations, and exercise the real surface through NSH tooling.
- **When adding SQL**: place application queries/migrations under `crates/pairidaezad/postgres/`, regenerate using the existing `generate:sql:pairidaezad` task, and retain isolated database tests.
- **When adding a crate or entrypoint**: establish its dependency direction and error boundary first, update this table, and reuse existing mise conventions. Do not add hakari integration without instruction.

## Before Committing Checklist

- [ ] `mise format` passes (each step read, not just the exit code)
- [ ] `mise run --force test` passes (if Rust changed)
- [ ] **No `allow` attributes**: all lint warnings fixed, not suppressed
- [ ] No `.unwrap()` or `.expect()` in production paths
- [ ] **Error boundary**: one `Error` + `Result` at root per boundary crate, children import from root, `eyre` only at the edge
- [ ] Dependency directions match the crate table; no server implementation imports in UI/contracts/telemetry
- [ ] Browser sessions, native authentication, and API bearer verification retain their separate responsibilities
- [ ] Semantic validation occurs once per operation boundary; ownership and revision checks remain enforced
- [ ] NSH docs and installed generated APIs checked for UI changes; actual rendered result inspected
- [ ] Generated SQL, affected contracts/callers, and documentation updated when relevant; no generated NSH files edited
- [ ] All public items have doc comments; no debug `println!` or `dbg!`
- [ ] No hardcoded credentials; no spec ids in code comments or error strings
- [ ] Banned vocabulary absent (`seam`, `spine`, `streak`, `pillar`, `load-bearing`, `birth`, `born`)

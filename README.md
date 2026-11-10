# Pairidaeza

The NSH UI is mixed Rust/TSX: `App.tsx` composes the UI and `src/lib.rs`
exports native Rust components, modules, and classes. The root Cargo package
shares a workspace with the Rust backend in `backend/`.

```sh
mise run build              # default debug build
mise run dev:desktop        # hot-reloading desktop UI; starts the API automatically
mise run test               # Rust and NSH tests, using the same managed API
mise run check              # hk checks, including rustfmt, clippy and nsh check
mise run format             # hk fixes, including rustfmt and TS/TSX/JSON formatting
```

Development targets are `dev:desktop`, `dev:ios`, `dev:android` and `dev:web`.
They all start or reuse the same managed `api` daemon.
Desktop and mobile use `nsh dev`. Android requires `adb` on PATH and a
connected device; it forwards the app's loopback port 17810 to the API port.
`dev:web` opens the packaged UI at the API origin; it does not start another web server.

NSH-generated files stay in `.nsh/`. Cargo build output stays in `target/`.

Tasks are file-based under `.mise/tasks/`, following Alvin's hierarchy.
`build/_default` depends on `build:debug`; `build:release` builds release binaries.
The daemon runs `dev:api`, which depends on `build:debug` and `dist:web`,
then executes `target/debug/pairidaeza-backend`. `dist:web` packages the NSH
web UI into `target/dist/web/pairidaezo`, served by that same API process.
Client development tasks and `test:ui` start or reuse the daemon automatically.
`test/_default` runs the full suite through `test:rust` and `test:ui`.
`verify` depends on `check` and `test`. No separate test server runs.
Use `mise daemons logs api` and `mise daemons stop api` to manage the local API.

## Backend

`mise run dev:desktop` starts the loopback-only HTTP and JSON-RPC WebSocket server automatically.
`GET /healthz` returns `ok`. WebSocket clients connect at `/` and call
`run.start` with `{"prompt":"..."}`, then `run.status` or `run.cancel` with
`{"runId":"..."}`. Status includes the completed result. Runs and tools are
isolated by authenticated issuer and subject and stored under
`PAIRIDAEZA_DATA_DIR` (the platform data directory's `pairidaeza` directory by
default). Browser sessions persist in a separate SQLite database there.

Configure Zitadel with `PAIRIDAEZA_AUTH__ISSUER`,
`PAIRIDAEZA_AUTH__CLIENT_ID`, `PAIRIDAEZA_AUTH__PROJECT_ID`,
`PAIRIDAEZA_AUTH__REDIRECT_URI`, and a secret
`PAIRIDAEZA_AUTH__SESSION_KEY`. The callback URL must end in
`/auth/zitadel/callback`. The issuer and redirect must match the registered
Zitadel application; use HTTPS at the public reverse proxy. Native clients use
the `/auth/begin` and `/auth/finish` flow and send the returned token in an
`Authorization: Bearer` header. Browser clients use `/auth/begin` and the
same-origin session cookie. Without a session key, authentication is disabled
for local development and the server logs a warning. The server refuses
non-loopback binds even in this mode.

The jcode executable is supplied by mise. Configure jcode's model provider and
credentials before starting runs. The server loads optional configuration from
the platform config directory at `pairidaeza/backend.toml`, overridden by
environment variables. Set `PAIRIDAEZA_ADDR` to change the loopback address and
`PAIRIDAEZA_WEB_DIST` to serve a built web directory.

The daemon follows the sibling Heyday service's Axum, Zitadel, persistent
session, and OpenTelemetry bootstrap pattern. The UI remains mock-data-only.
`jcode-sdk` is pinned in Cargo; mise supplies the jcode process. Only
`note_read` and `note_write` are exposed to the agent, scoped to its owner.
Note mutations and tool-call results commit together, preventing duplicate
application of the same call.

Run `mise run test:rust` for runtime, authentication, session persistence,
and HTTP/WebSocket coverage. Lifecycle logs identify the run, entry point,
outcome, and duration without recording prompts or note contents. Configure
the standard `OTEL_*` environment variables for trace export.

Interrupted runs are marked interrupted rather than automatically replayed.
Turns have a ten-minute deadline and cancellation a ten-second deadline;
deadline expiry records interruption, not successful cancellation.
Live model execution requires a configured jcode provider. Browser sign-in
requires a registered Zitadel application; neither credential is bundled.

## API-backed UI development

Start any client development task, for example `mise run dev:desktop`.
The UI loads fixtures from the backend and saves changes through the mock HTTP API.
Zitadel is not used in this mode. Mock authentication must be explicitly
enabled and cannot be combined with a Zitadel session key.

Mise sets the API and UI address to `http://127.0.0.1:17810`, avoiding Heyday's
port. Native hosts also default to `http://127.0.0.1:17810`.
Set `PAIRIDAEZA_API_URL` to use another loopback address. iOS passes this
through `SIMCTL_CHILD_PAIRIDAEZA_API_URL`; Android forwards port 17810 to its
configured API port with `adb reverse`.
The packaged web UI uses its own origin; cross-origin browser access is not enabled.

`mise run test` runs the complete Rust and NSH test suites.
For a focused UI test, use `mise run test:ui -- api-ui.test.tsx`.
Both start or reuse the managed API automatically; no manual server startup is needed.

UI journeys reset the development mock user's documents to fixtures.
Run them only with disposable mock data; tests replace edits made in the UI.

The mise daemon watches backend sources, fixtures, UI sources, icons, theme
and task inputs. A change restarts `dev:api`; its dependencies rebuild the
changed Rust or web inputs before the API starts again.
`dev:api` is the foreground process task used by the daemon, not a second server.

See [API-INVENTORY.md](API-INVENTORY.md) for the complete data inventory,
endpoint contract and mock limitations. Use fake vault values only: mock
storage is not encrypted credential storage. Bot replies and provider
connections are still simulated; API hookup does not make them live.

Chat attachments use the system file picker on desktop. On mobile, the attachment
menu offers Photo library and Browse files. Cancellation keeps the current draft
and attachments. Sending still stores filename markers, not uploaded file bytes.
This requires the prebuilt NSH nightly selected in `mise.toml` and Rust crates
pinned to `32a6f61f2c9c8c305a3719c02fd508ed61a94473`; stable 0.4.0 has no
`Picker.pickFiles`. Return the CLI and Rust crates to releases together when
0.4.1 or 0.5.0 is available. Run `mise install` after updating.

## Theme

`theme.json` contains the supplied tweakcn values in shadcn `cssVars` format.
Light and dark palettes share the font and radius tokens. Typography uses
IBM Plex Sans, IBM Plex Serif, and IBM Plex Mono, bundled locally under `fonts/`
with the SIL Open Font License.
App-specific aliases use the supplied semantic colors; bot identity colors and
status roles remain distinct.

NSH 0.4 reads colors, lengths and font families from `cssVars`, but not compound
shadow strings or `em` tracking values. Matching shadow presets, radius scale,
spacing and tracking are configured in `nsh.json`; existing shadow surfaces use
the adaptive `shadow-color` token. Keep these mappings synchronized with `theme.json`.

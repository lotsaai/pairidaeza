# Pairidaeza

The NSH UI combines TSX with Rust bindings. The Rust workspace separates
the application, browser server (`webui`), API (`pairidaezad`), shared
contracts (`protocol`), and observability (`telemetry`).

```sh
mise run build              # default debug build
mise run dev:desktop        # run the packaged desktop app in the foreground
mise run test               # Rust and NSH tests, using the same managed API
mise run check              # hk checks, including rustfmt, clippy and nsh check
mise run format             # hk fixes, including rustfmt and TS/TSX/JSON formatting
```

Development targets are `dev:desktop`, `dev:ios`, `dev:android` and `dev:web`.
Native clients start or reuse the managed `api` daemon on port 17810.
Mobile uses `nsh dev`. Android requires `adb` on PATH and a
connected device; it forwards the app's loopback port 17810 to the API port.
`dev:web` starts the managed `webui` daemon and opens port 17811.
The `webui` daemon depends on `api`, so each service runs once.

`dev:desktop` packages the app when its sources change and runs it in the
foreground. To rerun it after source changes, use `mise watch dev:desktop`.
Restarting discards in-memory state, including any authentication transaction
in progress. Finish authentication before changing watched files.

Settings uses a compact header with a left-side back chevron beside its title.
The chevron returns to the workspace; the right-side close button remains.

Mobile settings and integrations use the system navigation header, including
explicit close controls. Android Back returns from a section before closing its
dialog. Page transitions remain owned by `NavStack`; dialogs keep their existing
fade animation and the platform's reduced-motion behavior. Integration commands
remain available in a content toolbar on phones because `NavPage.header` is
desktop-only.

Phone navigation reserves the top safe-area inset before rendering custom
headers, keeping titles and Back buttons below the status bar and camera cutout.

The iOS chat reserves `env(keyboard-inset-height)` beneath its transcript and
composer. This keeps the header visible instead of allowing native keyboard
avoidance to pan the entire page. Android retains its native resize behavior.

The touch Create picker uses a searchable scroll view with 44-point rows and
`keyboardShouldPersistTaps="handled"`, so selecting a result works while its
search input is focused. Desktop keeps `Command` and its keyboard navigation.

On macOS, the task registers the packaged app with Launch Services before
starting it. The Linux and Windows release runners register the callback scheme
for the current user at startup. Linux requires `xdg-mime` on PATH. Close other
Pairidaeza instances before signing in so the callback reaches the instance
that started the authentication transaction.


NSH-generated files stay in `.nsh/`. Cargo build output stays in `target/`.

## Application SQL

Application SQL stays in `crates/pairidaezad/postgres/queries/`, with SQLx
migrations in `postgres/migrations/`. Generate typed queries separately from builds:

```sh
mise run generate:sql:pairidaezad
mise run test:rust
```

The root `sqlc.json` uses `sqlc-gen-rust` with `deadpool-postgres`; generated
queries use `tokio-postgres` through that pool. Regenerate after changing SQL.
Do not edit generated query files. The plugin URL and checksum identify the
current release artifact, not a policy to keep older dependencies.

Application database tests use the isolated PostgreSQL `test-context` pattern.
The browser session store is a separate integration in `webui`; it does not
use these generated queries or the application database test pattern.

## Run the services

Tasks are file-based under `.mise/tasks/`.
`build:debug` builds both executables with workspace-wide feature resolution.
The `api` daemon runs `dev:api`, which depends only on `build:debug`.
The `webui` daemon runs `dev:web`, which owns `build:debug` and `dist:web`.
`dev:web` runs the browser server; it does not open a browser.
Do not manually repeat those dependencies or start additional server instances.

```sh
mise daemons start webui
mise daemons logs api webui
```

Both services expose `/healthz`. `PAIRIDAEZA_ADDR` configures the API listener,
and `PAIRIDAEZA_WEB_ADDR` configures the browser listener.
`PAIRIDAEZA_WEB_DIST` selects the browser assets directory.
The browser server reads `pairidaeza/webui.toml` in the user config directory;
the API reads `pairidaeza/backend.toml`.

## Package the browser server

```sh
mise run dist:webui
```

This task builds the host-native release executables and packages the NSH
browser application through its existing task. The resulting
`target/dist/webui/` contains `webui` and `public/`.
Copy the whole directory to the deployment host and run `./webui` from that
directory. Build for the deployment host's OS and architecture.
The asset directory defaults to `public`; set `PAIRIDAEZA_WEB_DIST` to use another path.
TLS termination and external deployment infrastructure are not configured here.

## Backend and API contracts

`webui` serves the packaged browser application and owns browser OAuth/session
configuration and the PostgreSQL `tower-sessions` integration. `pairidaezad`
keeps JWT validation, API configuration, fixtures, and application SQL.
Both server crates depend on `protocol` for shared API contracts.
`telemetry` owns their shared observability setup.

`webui` implements discovery, authorization-code login with PKCE and nonce
verification, PostgreSQL-backed browser sessions, refresh, logout, and authenticated
API forwarding. `pairidaezad` validates bearer JWTs against discovered JWKS,
issuer and project audience, and loads the real profile from Zitadel UserInfo.
Application documents remain mock fixtures, isolated by authenticated issuer
and subject. Health checks remain public; `/openapi.json` describes the API.

The browser client uses `PAIRIDAEZA_AUTH__CLIENT_ID` and its registered
`PAIRIDAEZA_AUTH__REDIRECT_URI`. Native apps use the separate
`PAIRIDAEZA_AUTH__NATIVE_CLIENT_ID`, compiled into the app by mise builds,
and `ai.lotsa.pairidaeza:/auth` as their registered callback. Both registrations
must issue JWT access tokens for the configured project audience.
Set `PAIRIDAEZA_AUTH__ISSUER` to the provider issuer and
`PAIRIDAEZA_AUTH__PROJECT_ID` to the access token's project audience.
The API accepts RS256, RS384, and RS512 signatures with discovered JWKS keys.
The configured provider's discovery document advertises RS256, RS384, and RS512
for ID tokens; its current JWKS signing keys advertise RS256. Discovery does not
specify access-token algorithms. Other signing families are not accepted.
Issuer, audience, expiry, subject, and signature validation remain required.
If the provider changes signing families, update the verification policy before
rotating keys.

`PAIRIDAEZA_DATABASE_URL` selects browser-session PostgreSQL storage; local
development uses `pairidaeza_dev`. The current connector uses PostgreSQL without TLS.

Rust tests run through `mise run test:rust` using nextest. NSH tasks pass individual
TypeScript test files to NSH, avoiding its directory-level `cargo test` invocation.
Test tasks claim `TEST_USER`, `TEST_USER_EMAIL`, and `TEST_PASSWORD` through mise.
Auth failures shown in the application are generic.

Verification is organized by application surface:

```sh
mise test                 # Rust, desktop, web, then both mobile targets
mise run test:desktop     # Host desktop app, native sign-in, and model checks
mise run test:web         # Browser UI and real-provider authentication
mise run test:mobile      # Android, then iOS
mise run test:android     # Android only
mise run test:ios         # iOS only
```

The default task runs each suite sequentially because NSH targets share build
output. Every suite is attempted; any failed suite makes the command fail.
Both mobile targets must be available; unavailable targets are not skipped.
`test:desktop` selects macOS, Linux, or Windows from the host OS and includes
the existing non-rendered model/native-binding checks as well as real-host UI
journeys. There is no separate headless UI entrypoint.

`test:web` starts or reuses the managed `webui`, `api`, and WebDriver daemons.
It runs browser UI journeys and the existing Rust real-provider browser/native
authorization regressions. NSH arguments such as `--trace` apply to UI journeys,
not the Rust runner.
Install Chrome or Chromium, the matching mise-managed ChromeDriver, and PostgreSQL
with the configured `pairidaeza_dev` database first. The test account must be able
to sign in to Zitadel using its username and password without an interactive
second factor. The provider journey uses a fresh headless browser session and
does not save screenshots.

Run full mobile verification with `mise run test:mobile`. It runs Android and
iOS sequentially, attempts both suites even when one fails, and reports failure
if either fails. Both configured device targets must be available.
Individual targets remain available as `mise run test:android -- --trace -v`
and `mise run test:ios -- --trace -v`. These tasks run real native sign-in initiation,
shared account and API checks, and `mobile.test.tsx` on the device's own screen.
The mobile tests use touch-visible message controls and phone navigation rather
than desktop viewport sizes or hover. Desktop and browser coverage stays in the
desktop and web tasks. Every mobile test file runs, and any failure makes the task
fail.

Android native authentication verifies TLS against the bundled Mozilla root
certificates from `webpki-root-certs`, already used by NSH. The Android host does
not initialize the JNI context required by reqwest's default platform verifier.
Certificate and hostname verification remain enabled. Updating this root set
requires rebuilding the app; Android-installed custom CAs are not included.

Native test reports are not proof of a complete mobile sign-in round trip.
In NSH 0.5.0, the iOS driver's `app.back()` treats a full-screen dialog as a
swipe-dismissable sheet rather than navigating its inner stack. Verify the
system Back control separately; do not replace a failing assertion with a
passing check against content underneath the dialog. Likewise, wait for a
dialog to disappear before interacting with the workspace behind it.
UIKit system bar items also have no NSH view for `app.press()` to target.
Verify these controls through the simulator's actual window, retaining the
before/after screenshots and resulting route/dialog state. Direct computer
interaction verified Organization Back, Close settings, and Close integrations
on iOS 27.2; the corresponding NSH-only journeys still report failures.

Earlier verification passed all three provider regressions, now included in `test:web`. The browser
test covered login, callback, provider email, fixture bootstrap, reload, logout,
and post-logout HTTP 401. Native tests covered PKCE binding, code exchange,
ID-token verification, UserInfo, and authenticated API bootstrap without a
refresh token. The token serialization regression also passed.

`mise run test:desktop` includes the desktop-window sign-in regression.
NSH owns each test window and cleanup; it does not run `dev:desktop` or a desktop
daemon. Earlier verification passed sign-in initiation, cancellation, and retry
on macOS, 18 Rust tests, and 59 non-rendered NSH tests. Those results predate
the task consolidation and are not a full all-surface verification result.

NSH records outgoing browser URLs instead of opening them, and its installed
test API supports callback injection only headless. The desktop-window test
does not prove browser login or OS callback delivery. The macOS debug host also
emits a linker warning that its `__eh_frame` section exceeds 16 MB.

Full desktop UI callback completion, Linux and Windows execution, and mobile
callback round trips remain unverified.

## Vendored JWT authentication

`crates/pairidaezad/src/axumext/jwtauth.rs` owns JWT bearer validation,
Axum claims extraction, and local-key or remote-JWKS decoding. Its implementation
is imported from
[`axum-jwt-auth` at `0855b9cc4dcca4827073b4d7f4efe435a827e8ce`](https://github.com/cmackenzie1/axum-jwt-auth/tree/0855b9cc4dcca4827073b4d7f4efe435a827e8ce).
The upstream MIT license is retained in `axumext/jwtauth/LICENSE`.
Module imports are adapted locally, and HTTP-client construction errors propagate
instead of panicking. No example keys or certificates are copied.

The decoder does not implement OAuth/OIDC login or browser sessions. Callers
configure the accepted algorithms, issuer, audience, required claims and JWKS URL.
Remote keys refresh periodically; an unknown key ID is rejected until refresh.

Run the JWT boundary tests without changing workspace feature resolution:

```sh
mise run test:rust -- -E 'test(jwtauth)'
```

The filter limits test execution, not workspace compilation.


Chat attachments use the system file picker on desktop. On mobile, the attachment
menu offers Photo library and Browse files. Cancellation keeps the current draft
and attachments. Sending still stores filename markers, not uploaded file bytes.
The project uses the stable NSH 0.5.0 Rust crates and the CLI selected in
`mise.toml`. Run `mise install` after updating the tool configuration.

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

## Backend observability

Both executables use `crates/telemetry` for the shared trace, metric, and log
providers. Each initializes telemetry before Tokio with its own service name
and shuts down all three providers after the server returns, including startup
errors. Logs shut down last so earlier shutdown failures can still be exported.

Debug builds print pretty logs to stderr; release builds print JSON.
`PAIRIDAEZA_LOG` overrides `RUST_LOG`; the default is `info`.
Standard `OTEL_*` variables configure exporters, sampling, and metric export intervals.

The mise defaults export OTLP over HTTP/protobuf to `http://127.0.0.1:4318`.
Run a collector there for ongoing collection, or override the endpoint and
protocol in local mise configuration for another collector.

HTTP request instrumentation and end-to-end OTLP export verification are not
part of this server wiring.

---
name: verify-pairidaeza
description: Drive Pairidaeza's real desktop NSH app and browser UI, capture behavioural evidence, and clean up safely. Use after sign-in, chat, search, settings, or platform changes. Includes native auth initiation and real-provider browser session recipes.
---

# Verify Pairidaeza

Read [the feature map](features/README.md) before choosing a journey. Run commands from the repository root. Paths in this document are repository-relative unless linked.

## Launch

The primary target is the desktop NSH app. The browser UI, bearer-token API, iOS app, and Android app are separate targets. Desktop verification uses the existing NSH real-host runner, not a second `dev:desktop` process.

1. Require the configured mise tools, a graphical desktop session, and HTTPS access to `auth.lotsa.ai`. On macOS, use the logged-in user's WindowServer session.
2. Build with `mise build`. Do not invoke `nsh`, `cargo test`, or `mise exec --` directly. Escalate mise environment failures without changing the environment.
3. Run Doctor below.
4. Run the Drive cell below. It invokes `mise run test:desktop` with trace and verbose output retained in the run directory. This task selects the host OS, builds the real development host, runs desktop journeys including native sign-in, and closes each test window. It starts or reuses the managed API.

The native journey starts with `storage: {}` and `network: "live"`. No saved profile, test password, database, or fixture seed is required. Ready means `Sign in to Pairidaeza` is rendered, not merely that compilation finishes. The test waits for this before pressing Sign in. Native OAuth configuration comes from the existing mise/native build integration. The registered callback is `ai.lotsa.pairidaeza:/auth`.

For an interactive packaged desktop run, use `mise run dev:desktop`. It owns packaging and Launch Services registration and starts or reuses the managed API. Stop only that foreground task. Never run it beside a native sign-in test or another Pairidaeza instance, because the callback scheme is shared.

For browser session verification, use `mise run test:web`. Follow the browser and database prerequisites in [Development Workflow](../../../AGENTS.md#development-workflow-mise). The database role needs permission to create schemas and tables for `webui` startup. If a required environment variable is missing, stop and report its name. Never open secret files or look up the value.

Browser readiness requires both `/healthz` endpoints, the rendered signed-out page, and successful real-provider login plus fixture bootstrap. A database health check alone is insufficient. An absent database, missing credentials, or interactive second factor is a failed precondition, not permission to mock login. Browser setup from an empty PostgreSQL database is not proved by the native journey.

## Doctor

Run this read-only check first whenever launch, selectors, or authentication look wrong. Use the Python Eval kernel. It checks the configured NSH executable and the actual provider metadata, without opening an OAuth transaction.

```python
import json
from datetime import datetime, timezone
from pathlib import Path

proof = Path("target/verification") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ-native-auth")
proof.mkdir(parents=True, exist_ok=False)
nsh_path = sh("mise which nsh", timeout=30).strip()
metadata = json.loads(sh("curl --fail --silent --show-error --max-time 20 https://auth.lotsa.ai/.well-known/openid-configuration", timeout=30))
assert metadata["issuer"] == "https://auth.lotsa.ai"
assert metadata["authorization_endpoint"] == "https://auth.lotsa.ai/oauth/v2/authorize"
write(str(proof / "doctor.json"), json.dumps({"nsh": nsh_path, "issuer": metadata["issuer"], "authorization_endpoint": metadata["authorization_endpoint"]}, indent=2))
print(str(proof))
```

For browser trouble, also inspect `mise daemons ls`, `lsof -nP -iTCP:17811 -sTCP:LISTEN`, and both health responses. Require the listener's process to belong to this checkout before driving. Do not treat another process answering the same port as this app. The desktop suite starts or reuses the API.

## Drive

Use the existing harness, with real selectors from the feature map. Run this Python Eval cell after Doctor. `proof` remains in that kernel.

```python
write(str(proof / "build.log"), sh("mise build", timeout=300))
command = "mise run test:desktop -- --trace -v"
write(str(proof / "command.txt"), command + "\n")
try:
    transcript = sh(command, timeout=1800)
except Exception as exc:
    write(str(proof / "desktop.log"), getattr(exc, "output", str(exc)))
    raise
else:
    write(str(proof / "desktop.log"), transcript)
print("Desktop suite passed, including native sign-in initiation, cancel, and retry.")
```

`auth.integration.test.tsx` imports `open` directly from `nsh/test`. It presses `role:button[Sign in]`, waits for `Complete sign-in in your browser.`, validates the real authorization request, presses `role:button[Cancel]`, and retries with new PKCE, state, and nonce values. Require this named journey to pass within the desktop suite.

For fixture UI journeys, use `mise run test:desktop -- --trace` on the desktop host, `mise run test:web -- --trace` for browser rendering, or `mise run test:mobile -- --trace` for the host's mobile target. These tasks run the existing platform suites. Do not add filters, custom launchers, or replacement test tasks. `test-app.ts` intercepts the existing bootstrap/document HTTP boundaries and supplies an isolated fixture identity. This proves fixture UI behaviour, never authentication or server persistence. Non-rendered runs cannot prove geometry.

For browser authentication, retain the existing Rust Fantoccini journey at `crates/webui/tests/browser_auth.rs`. It drives the packaged page through real login, profile, reload, and logout. For extra browser interaction or screenshots, open an isolated browser through the available browser tool, navigate to `http://127.0.0.1:17811/`, and use that feature's CSS selectors. Never borrow the user's signed-in tab, inject tokens, call internal setters, or replace provider requests.

## Evidence

Keep all proof in the unique `target/verification/<timestamp>-native-auth/` directory created by Doctor. Keep separate directories for other journeys. Evidence survives app teardown and session cleanup, but not `mise clean`; copy it elsewhere before cleaning build output.

- Record the feature ID, platform, entry point, command, exit result, and untested paths. Keep the action trace and JUnit report together. A green report without the action trace is insufficient.
- Read verbose build warnings. Record warnings without suppressing them or claiming a warning-free build.
- For visual changes, capture the real target with `await app.screenshot("target/verification/settings-after.png")` at the relevant steps in the existing NSH journey. Use the installed `.nsh/types/nsh/test.d.ts` API. Capture before, action, and resulting state in separate files. Inspect the PNG. The default native auth journey captures a trace, not screenshots.
- For browser screenshots, capture the app before login and after callback, an accessibility snapshot, and the resulting visible account state. Do not capture populated password fields, cookies, bearer tokens, callback codes, full authorization URLs, or raw authentication HAR files.
- Verify side effects through a second read-only view. Browser auth checks provider email and `/api/data/bootstrap`, reload persistence, then HTTP 401 after logout. Fixture mutations require reopening the item; they do not prove backend persistence or an external message being sent.
- Never claim that native `openedUrls()` proves an OS browser opened. NSH records outgoing URLs and reports them opened without launching a browser. The real-host test cannot inject OS callbacks. Native browser navigation and complete callback delivery need separate packaged-app evidence.
- A dry-run or test label is not proof of isolation. This native test performs real provider discovery; the browser test contacts Zitadel and writes PostgreSQL sessions. Fixture UI tests use the HTTP interception declared in `test-app.ts`.

## Cleanup

Let the NSH task exit normally, including after a failing assertion. NSH owns and closes its test windows and isolated app storage. Do not run `dev:desktop` to keep a test window alive. On interruption, stop the exact tool job you started and inspect its owned child PIDs. Never use `pkill`, kill by process name, or delete generated `.nsh/` files.

Before launch, record `mise daemons ls` and native test-host processes. After the task exits, inspect process state again. Investigate any new surviving test host before declaring cleanup complete. Leave pre-existing desktop apps and daemons untouched. If this run started previously stopped daemons, stop only those recorded as run-owned, in dependency order: `mise daemons stop webdriver`, then `mise daemons stop webui`, then `mise daemons stop api`. Never drop or truncate the shared development database.

The browser regression closes its WebDriver session on success and ordinary journey failure. Close any additional browser tab you opened. Remove only run-owned scratch files and profiles, never proof files. Do not drive two native auth runs simultaneously. Do not mutate the same browser test identity from two runs. Ports, session storage, callback registration, and mise daemon state are shared; this checkout is not a parallel disposable stack.

After cleanup, run this Python Eval check and retain the result.

```python
required = [proof / name for name in ("doctor.json", "command.txt", "desktop-auth.log", "desktop-auth.xml")]
assert all(path.is_file() and path.stat().st_size > 0 for path in required)
write(str(proof / "evidence-survived.txt"), "Doctor, command, trace, and JUnit report remain after app cleanup.\n")
```

## Helpers

Reuse the platform suite tasks above. Python snippets run in the agent's Eval kernel using its `sh` and `write` helpers.

Maintain the feature map with `/skill:maintain-verification-skill` when user paths or verification prerequisites change.

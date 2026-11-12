# Pairidaeza verification map

Read this index before driving the app. These are maintained user journeys, not a claim that every entry point has passed.

## Baseline preconditions

- Run from the repository root with the configured mise tools. Use the launch and Doctor instructions in the parent skill.
- Native sign-in starts a real desktop window with empty storage and live provider discovery. No test password or database is needed for initiation.
- Fixture UI tests start isolated app state through `test-app.ts`, using the JSON documents in `crates/pairidaezad/fixtures/`. Expect Writer, Finance, Chief of Staff, and Launch team. Missing fixture content is a failed precondition.
- Browser session tests require the actual provider account, configured PostgreSQL database, and the managed API, browser server, and WebDriver. Credentials come from the existing mise task, never from a new mock identity.
- Do not double-drive native auth, the shared development browser session, or a test identity. Preserve services running before verification.

## Driving conventions

NSH selectors use `role:button[Account]`, `text:Settings`, and `label:Search`. Browser selectors use CSS and ARIA attributes. Do not interchange the grammars.

Run desktop UI and native initiation with `mise run test:desktop -- --trace -v`. Run browser UI and real-provider sessions with `mise run test:web -- --trace`. Run both mobile targets with `mise run test:mobile -- --trace`, or select `test:android` or `test:ios` individually. Do not create new launchers or bypass mise tasks.

Each feature file identifies exact existing selectors and expected results. Reuse these steps in the adjacent NSH tests when a journey changes. Fixture tests prove the app's UI against fixture HTTP responses, not authentication or server persistence. Do not use `test-app.ts` for an auth proof.

## Proof and failure reporting

Keep commands, action traces, results, and any screenshots under `target/verification/`, outside generated `.nsh/` state. The native proof uses a unique run directory. Capture both the user action and its resulting state. Reopen mutated items and verify the transport or persisted read when relevant. Never retain credentials or raw token-bearing URLs.

Report feature IDs and each entry point separately. A single passing path does not cover other entries. A missing seed, credential, platform, or callback capability is a failed or unverified journey with its exact reason, not an assertion to weaken. A native trace does not replace a screenshot for visual work.

## Features

- [Native sign-in initiation](native-sign-in.md). Sign in, cancel, and retry against real provider discovery.
- [Browser session and profile](browser-session.md). Real login, profile, reload persistence, and logout.
- [Chat messages](chat.md). Send, reply, and react to fixture conversations.
- [Search](search.md). Global command search and sidebar search entry points.
- [Settings navigation](settings.md). Account and command-search entries, sections, and both workspace-return controls.

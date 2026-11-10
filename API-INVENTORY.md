# UI API inventory

Scope: existing UI behavior with server-hosted mock data, not real integrations or agent execution.

| Namespace      | UI surfaces and API-backed state                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace`    | Account/preferences/appearance/model/approval preference; organizations; spaces/members/invites; sidebar sections and chat ordering; bots/groups; messages/replies/reactions/questions/unread markers; routines and mock run history; pages; skills; artifacts; referral and app/documentation URLs |
| `models`       | Provider/model catalog, connection summaries, model roles                                                                                                                                                                                                                                           |
| `voice`        | Provider/voice catalogs, connection summaries and speech configuration                                                                                                                                                                                                                              |
| `memory`       | Connection summary, scope and provider configuration                                                                                                                                                                                                                                                |
| `vault`        | Mock entries and their editable fields                                                                                                                                                                                                                                                              |
| `usage`        | Mock usage summary and model breakdown                                                                                                                                                                                                                                                              |
| `computer`     | Provider catalog/configuration, access toggle and devices                                                                                                                                                                                                                                           |
| `approvals`    | Mode, rules, checker availability and tool catalog                                                                                                                                                                                                                                                  |
| `integrations` | App/plugin/MCP catalogs, connected accounts, installed parts, sign-ins, bot assignments, servers, sources and GitHub preview fixture                                                                                                                                                                |
| `templates`    | Directory listings and complete bot prompts                                                                                                                                                                                                                                                         |

## HTTP contract

Explicit development mode: `PAIRIDAEZA_MOCK_AUTH=true`, without a Zitadel session key. The daemon still binds loopback only. Mock identity is Alex Rivera (`u1`); it is not proof of identity and must not be exposed as production authentication.

- `POST /api/mock/session`: create a mock session; returns `{user,token}`. Optional `{reset:true}` resets this development user's documents to fixtures for isolated tests.
- `GET /api/mock/session`: read authenticated mock user.
- `DELETE /api/mock/session`: revoke mock session.
- `GET /api/mock/bootstrap`: `{user,documents:{namespace:{revision,state}}}`.
- `PATCH /api/mock/state/{namespace}`: `{revision,changes}` shallow field updates; returns `{revision,state}`. A stale revision returns HTTP 409 instead of overwriting newer state.

Native clients send the returned token as `Authorization: Bearer <token>`. Fixture JSON lives only in `backend/fixtures/`; persisted documents are seeded once per user, not whenever a collection is empty. Existing `run.*` WebSocket methods remain separate from these mock UI documents.

## Local-only state

Navigation, selection, searches, filters, unsent drafts, attachment selections, open dialogs, reveal/sample animations and layout preferences remain client-owned. Existing store mutations persist the resulting domain fields through the mock API. Simulated bot replies and routine results remain simulated, not jcode results.

## Existing limitations, not implemented integrations

- Model, voice, memory and connector forms do not establish real provider connections. Existing discarded API credentials are not promoted to secure storage.
- Mock vault fields persist in ordinary SQLite. Use fake values only; this is not a secure credential vault.
- File and photo attachments still send filenames, not file uploads.
- Invite/referral/download URLs remain fixture examples, not real delivery services.
- Password update/account deletion/import/export and other existing server-required actions are not made real by loading mock data through HTTP.
- No Zitadel login or live model execution is required for this development test path.

Verification evidence is reported separately from this inventory; API coverage is not a claim of exhaustive automated UI coverage.

## Verification performed

- Before the task hierarchy migration, backend tests passed 25 tests,
  including real HTTP mock-session, revision-conflict, persistence, reset
  and empty-state coverage.
- Before the migration, NSH tests passed 40 tests; the remaining save-recovery
  test's route matching was corrected and passed separately. Together these
  cover 35 live-API UI journeys, five pure logic tests and one stubbed
  failure/retry test. This is not exhaustive coverage of every settings field
  or catalog operation.
- The live-API reload journey creates a bot and connects Notion through
  the UI, then verifies both in a fresh UI engine.
- `nsh check` and `nsh build` passed.
- A temporary `nsh test --target macos` journey rendered the API-backed
  workspace and Usage screen; screenshots were inspected. The temporary
  test was removed afterward.

Current entrypoints are `mise run test:rust`, `mise run test:ui` and
`mise run test`. The default `test/_default` orchestrates both complete suites.
Development and UI tests start or reuse the same managed `api` daemon
automatically. UI journeys reset the mock user's documents, so use
disposable mock data only.

After restoring default task orchestration, `mise run build` succeeded.
With the API initially stopped, `mise run --force test` started it automatically
and passed all 25 Rust tests and all 41 NSH tests.

Development task verification packaged the web UI and loaded it from the API
origin, including successful same-origin session/bootstrap requests.
Desktop `nsh dev` connected; the iOS simulator rendered API-backed fixture data.
A temporary health-route source edit changed the served response after an
automatic compile/restart. Restoring it caused another compile/restart.
A UI source change also repackaged the web bundle served by the same daemon.

Mock updates replace whole fields. Concurrent edits to the same field use
last-writer-wins after revision rebasing; this is not a production
multi-client collaboration protocol. Native macOS, iOS development launch,
and local API-hosted browser rendering were verified. Android was not launched:
`adb` is unavailable in the current environment.

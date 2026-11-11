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

Authentication is real Zitadel OIDC. Application documents remain mock data.
ID tokens must use ES256 or EdDSA; RSA signatures are rejected. Signing keys for tests are generated in memory, never stored in the source tree.

- `GET /auth/session`: authenticated provider user, or HTTP 401.
- `POST /auth/logout`: clear the browser session or revoke the supplied native credential.
- `GET /api/data/bootstrap`: `{user,documents:{namespace:{revision,state}}}`.
- `PATCH /api/data/documents/{namespace}`: `{revision,changes}` shallow field updates; returns `{revision,state}`. A stale revision returns HTTP 409.

Web uses the same-origin session cookie. Native clients send
`Authorization: Bearer <token>`. The bootstrap user is the actual authenticated
provider profile. Fixture JSON lives in `backend/fixtures/`; documents are
seeded once per authenticated issuer and subject. Mock data does not imply
mock authentication.

## Local-only state

Navigation, selection, searches, filters, unsent drafts, attachment selections, open dialogs, reveal/sample animations and layout preferences remain client-owned. Existing store mutations persist mock document fields through the authenticated data API. Bot replies and routine results remain simulated.

## Existing limitations, not implemented integrations

- Model, voice, memory and connector forms do not establish real provider connections. Existing discarded API credentials are not promoted to secure storage.
- Mock vault fields persist in ordinary SQLite. Use fake values only; this is not a secure credential vault.
- File and photo attachments still send filenames, not file uploads.
- Invite/referral/download URLs remain fixture examples, not real delivery services.
- Password update/account deletion/import/export and other existing server-required actions are not made real by loading mock data through HTTP.
- UI fixture tests use NSH's network stubs. They do not prove real Zitadel authentication.

Verification evidence is reported separately from this inventory; API coverage is not a claim of exhaustive automated UI coverage.


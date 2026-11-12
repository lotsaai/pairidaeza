# Browser session and profile

A browser user signs in with Zitadel, sees their real profile alongside fixture application data, stays signed in after reload, and logs out.

## Sub-features

- `browser-login` completes the real provider redirect and callback.
- `browser-profile` shows the provider's email and loads authenticated application fixtures.
- `browser-reload` preserves the session across reload.
- `browser-logout` removes authenticated access.

## How to get to it (user POV)

Open `http://127.0.0.1:17811/` and choose Sign in. Complete the provider's username and password forms. Open Account to view the profile. Reload the page, open Account again, and choose Log out.

## Driving it with Fantoccini

Preconditions:

- Chrome or Chromium, matching mise-managed ChromeDriver, and PostgreSQL are installed.
- The configured `pairidaeza_dev` database exists. The browser service creates its session tables at startup.
- The task can claim `TEST_USER`, `TEST_USER_EMAIL`, and `TEST_PASSWORD`. The account supports password login without an interactive second factor.
- Record pre-existing daemons. Run `mise daemons start webui` and inspect listener ownership plus both health endpoints as described in the parent skill. Do not start a second stack on the same ports.

- **Run.** Use `mise run test:web`. This runs browser UI and the existing `real_provider_browser_auth` journey plus native OAuth regressions. Capture stdout, stderr, and exit status in the run's evidence directory.
- **Enter login.** The browser journey opens `http://127.0.0.1:17811/`, waits for `#app .nsh-root`, and clicks `#app .nsh-root [aria-label='Sign in']`.
- **Authenticate.** It enters the configured account into `input[name='loginName']`, clicks `button[type='submit']`, then enters the configured password into `input[type='password']` and submits. Never print those values or save a populated password screenshot.
- **Confirm profile and data.** It waits for `[aria-label='Account']`, opens it, and requires the provider email in the visible account labels. A read-only `/api/data/bootstrap` request must return that email and the seeded OpenAI Codex model entry.
- **Reload.** It refreshes, reopens Account, and requires the same email and `[aria-label='Log out']`.
- **Log out.** It clicks `[aria-label='Log out']`, waits for `[aria-label='Sign in to Pairidaeza']`, then requires `/api/data/bootstrap` to return HTTP 401.
- **Proof.** Require the real browser regression to run, not be skipped. The existing task closes the WebDriver session. It does not save screenshots; use a separate isolated browser journey for visual evidence without reusing the user's account session.

## Gotchas

- Public `/healthz` success does not prove authentication, profile loading, or fixture bootstrap.
- Missing credentials, PostgreSQL, the test account, or a required second factor is a failed precondition. Do not replace the provider with stubs or inject session cookies.
- The fixed callback origin and managed ports prevent independent parallel stacks using the current task configuration.
- Browser verification writes real session rows and contacts the provider. Logout invalidates this application session; it is not proof that the provider's entire SSO session ended.
- A native sign-in initiation pass does not cover this journey. An existing database does not prove fresh-database provisioning.

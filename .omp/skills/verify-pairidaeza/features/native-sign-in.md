# Native sign-in initiation

A signed-out desktop user can start authentication, cancel the waiting state, and start a fresh attempt.

## Sub-features

- `native-sign-in-start` shows the waiting state and requests the configured Zitadel authorization URL.
- `native-sign-in-cancel` returns to the signed-out screen.
- `native-sign-in-retry` starts another attempt with different state, nonce, and PKCE challenge.

## How to get to it (user POV)

Open the desktop app with no saved account. Choose Sign in on the `Sign in to Pairidaeza` screen. While waiting, choose Cancel, then Sign in again.

## Driving it with NSH

Preconditions:

- `mise build` and the parent skill's Doctor pass.
- A graphical host session is available. No other native auth test or packaged app is handling the callback scheme.
- Use `auth.integration.test.tsx`, which opens `App.tsx` through `nsh/test` with `network: "live"` and `storage: {}`.

- **Launch and start.** Run `mise run test:desktop -- --trace -v` through the evidence-capture recipe in the parent skill. The journey waits for `Sign in to Pairidaeza`, then calls `await app.press("role:button[Sign in]")`.
- **Observe the request.** `await app.waitFor("Complete sign-in in your browser.", { timeout: 20_000 })` must pass. The test requires one recorded URL for `https://auth.lotsa.ai/oauth/v2/authorize`, native client `399234353625923915`, callback `ai.lotsa.pairidaeza:/auth`, response type `code`, S256 PKCE, nonempty state and nonce, and the required identity and project-audience scopes.
- **Cancel.** `await app.press("role:button[Cancel]")` followed by `await app.waitFor("role:button[Sign in]")` must pass. The waiting text must disappear.
- **Retry.** `await app.press("role:button[Sign in]")` must return to the waiting state. The second URL must have different state, nonce, and challenge values.
- **Proof.** Keep the trace and suite exit status. Require the native sign-in journey to pass without skips, as well as the complete desktop suite. Confirm each test window closes and the evidence remains.

## Gotchas

- NSH records `openUrl` requests instead of opening the OS browser. This journey proves native UI initiation and request construction, not actual browser navigation or completed login.
- Real-host `app.openWithUrl()` is unsupported in the installed NSH test API. Do not claim OS callback delivery from a headless injection.
- macOS development-host builds can emit a linker warning. Capture verbose output and report it.
- Linux and Windows select their real hosts through the same task, but a macOS run does not verify those platforms. Mobile callback completion is also separate.

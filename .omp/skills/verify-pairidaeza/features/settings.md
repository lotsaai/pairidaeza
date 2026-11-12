# Settings navigation

Users open Settings, move between sections, and return to the workspace using either the back chevron or the close button.

## Sub-features

- `settings-account-entry` opens Settings from Account.
- `settings-search-entry` opens Settings through global command search.
- `settings-sections` switches between General, Usage, and Organization.
- `settings-close` returns through Close settings.
- `settings-back` returns through Back to workspace.
- `settings-phone-back` returns from a section to the phone-sized settings list.

## How to get to it (user POV)

Open Account at the sidebar footer and choose Settings. Alternatively press Command+K and search for Settings. Choose a section. Return to the workspace with either the left-side back chevron or the right-side close button. In a phone-sized layout, a section's Back button returns to the section list.

## Driving it with NSH

Preconditions:

- Use the existing `test-app.ts` fixture app and `App.test.tsx` journeys.
- Desktop tests use 1280 × 800. The phone-layout journey uses 390 × 844. A narrow macOS window is not an iOS or Android device proof.

- **Run.** Use `mise run test:desktop -- --trace` for the real desktop host or `mise run test:web -- --trace` for browser rendering.
- **Account entry.** `await app.press("role:button[Account]")`, then `await app.press("text:Settings")`. Require `text:Send with Enter`.
- **Usage section.** `await app.press("role:button[Usage]")` must remove `text:Send with Enter`.
- **Close.** `await app.press("role:button[Close settings]")` must return to `text:Message Launch team`.
- **Back chevron.** Reopen Settings through Account, then press `role:button[Back to workspace]`. Require `text:Message Launch team` again. Do not substitute the close button for this entry.
- **Search entry.** Press `mod+k`, type `Settings` into `text:Search chats, bots and pages`, then press Enter. Require `text:Send with Enter`. Record this separately; the Account entry test does not cover it.
- **Phone section navigation.** In the 390 × 844 fixture app, open Account then Settings. Press `role:button[Organization]`, require `text:Delete organization`, then press `role:button[Back]`. Require `role:button[Updates]`. Press `role:button[Back to workspace]` and require Account.
- **Proof.** Retain each action and resulting section or conversation. For header or layout changes, capture real-target screenshots before and after each return control. Do not infer button placement from a headless selector pass.

## Gotchas

- `Back`, `Back to workspace`, and `Close settings` have different destinations. Preserve all three checks.
- Launch team must be the initial fixture conversation for the desktop return checks. If seed data changes, report the failed precondition and update the maintained journey deliberately.
- Merely seeing `Delete organization` does not require pressing it. Do not destroy shared data during navigation verification.
- These fixture journeys do not prove that changed settings survive an authenticated API reload. Verify that separately when persistence is the requested behaviour.

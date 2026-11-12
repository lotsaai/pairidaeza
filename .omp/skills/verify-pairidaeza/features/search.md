# Search

Users find chats through global command search or narrow the sidebar through its Search control. These are distinct entry points.

## Sub-features

- `search-global-chat` opens a matching chat through the keyboard command palette.
- `search-global-action` opens Settings from the palette.
- `search-sidebar-dismiss` opens and dismisses the sidebar search field.
- `search-empty` displays the global palette's empty state.

## How to get to it (user POV)

Press Command+K on macOS, or the platform's equivalent modifier, for global search. Type `finance` and press Enter to open Finance. Type `Settings` to choose the settings action instead. The sidebar Search button opens its own search field and is not the global command palette.

## Driving it with NSH

Preconditions:

- The fixture app has Finance and a visible sidebar. Use 1280 × 800.
- Existing journeys live in `App.test.tsx` and `sidebar.test.tsx`. Palette entries and its empty state are declared in `pages/Search.tsx`.

- **Run.** Use `mise run test:desktop -- --trace` or `mise run test:web -- --trace`. Keep individual journey results.
- **Find Finance.** `await app.keyboard.press("mod+k")`, `await app.type("text:Search chats, bots and pages", "finance")`, and `await app.keyboard.press("enter")`. Require `text:Message Finance`.
- **Open Settings.** Start a fresh fixture app, press `mod+k`, type `Settings` in `text:Search chats, bots and pages`, and press Enter. Require `text:Send with Enter`. This entry is source-mapped; the existing Finance test does not prove it.
- **Empty search.** In a fresh global palette, enter `no-such-chat-verification` and require `Nothing matches`. Press Escape to close. Missing empty-state coverage must be reported rather than inferred from the Finance pass.
- **Sidebar entry.** `await app.press("role:button[Search]")` must show `label:Search chats`. `await app.keyboard.press("escape")` must remove that field. This is the existing `Escape closes the search field` journey.
- **Proof.** Capture the entry action, search text, results, and selected conversation or closed field. Record each entry separately. Use a real-target screenshot for layout changes.

## Gotchas

- Global search uses `Search chats, bots and pages`; sidebar search uses `Search chats`. Mixing them produces misleading selector failures.
- App fixtures must contain Finance. Do not replace the query if it disappears; report the fixture mismatch.
- Search includes bot settings, pages, New bot, and Settings actions as well as chats. An arbitrary first result is not proof of the requested result type.
- Fixtures isolate UI state only. Search results do not prove authenticated API access.

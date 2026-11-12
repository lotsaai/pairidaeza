# Chat messages

A user opens a conversation, sends a message, quotes a message in a reply, and adds a reaction. Application replies remain fixture-backed.

## Sub-features

- `chat-send` appends the user's message, clears the composer, and shows the fixture reply.
- `chat-reply` quotes the selected message above the new reply.
- `chat-reaction` adds the chosen emoji below a message.

## How to get to it (user POV)

Choose Writer in the sidebar to send a message. Choose Chief of Staff, hover the message `what does this week look like?`, and choose Reply or React from its message controls.

## Driving it with NSH

Preconditions:

- Launch through the existing platform suite and its `test-app.ts` fixture helper. Writer and Chief of Staff must exist.
- Use a desktop viewport for hover actions. The adjacent `App.test.tsx` journeys use 1280 × 800 and the macOS platform.

- **Run.** Use `mise run test:desktop -- --trace`; for real browser rendering use `mise run test:web -- --trace`. Retain the named journey results, not just the suite exit code.
- **Send.** `await app.press("role:button[Writer]")`, `await app.type("text:Message Writer", "tighten the intro")`, and `await app.press("role:button[Send]")`. Require `tighten the intro`, then `on it. I'll report back here when it's done.`. `app.value("text:Message Writer")` must be empty.
- **Reply.** Press `role:button[Chief of Staff]`, hover `text:what does this week look like?`, and press `role:button[Reply]`. Require `role:button[Cancel reply]`. Type `move it to Friday` into `text:Message Chief of Staff` and press Send. Require `↩ You: what does this week look like?` and no Cancel reply control.
- **React.** On a fresh fixture app, open Chief of Staff and hover the same message. Press `role:button[React]`, then `role:button[🎉]`. Require the picker button to disappear and `🎉` to appear in the conversation.
- **Proof.** Capture each action and result. For geometry or appearance changes, save real-target screenshots using `app.screenshot`. For a persistence claim, leave and reopen the conversation and confirm the message or reaction, then verify the real API read separately. The existing fixture suite alone cannot establish server persistence.

## Gotchas

- Fixture bootstrap includes an isolated test identity. It does not prove real sign-in, external model execution, or network message delivery.
- A missing seeded message is a failed precondition. Do not silently switch to a different conversation.
- The same emoji label can exist in the picker and the message. Wait for the picker button to disappear before checking the resulting reaction.
- Attachments currently become filename markers, not uploaded file bytes. Do not claim an upload from a sent marker.

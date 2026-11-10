import { expect, open, test } from "nsh/test";

test("failed save retains later edits and retry persists the latest value", async () => {
  let revision = 0;
  let value = "initial";
  let writes = 0;
  const user = { id: "u1", name: "Alex Rivera", email: "alex@example.com" };
  const app = await open("./api-test-app.tsx", {
    network: {
      "POST */api/mock/session": { body: { user, token: "test" } },
      "GET */api/mock/bootstrap": () => ({ body: { user, documents: { test: { revision, state: { value } } } } }),
      "PATCH */api/mock/state/test": (request) => {
        writes++;
        if (writes === 1) return { status: 500, delay: 100, body: {} };
        const body = JSON.parse(request.body ?? "{}");
        value = body.changes.value;
        revision++;
        return { body: { revision, state: { value } } };
      },
    },
  });
  await app.waitFor("initial");
  await app.press("role:button[First]");
  await app.press("role:button[Second]");
  await app.waitFor("Error: Saving test failed (HTTP 500)");
  await app.press("role:button[Retry]");
  await app.waitFor("Saved");
  expect(value).toBe("second");
});

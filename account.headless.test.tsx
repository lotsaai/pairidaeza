import { expect, open as openApp, test } from "nsh/test";
import { fixtureData, open } from "./test-app";

const wideWindow = { width: 1280, height: 800 };

test("get the mobile app offers both stores", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Account]");
  await app.press("text:Get the mobile app");
  await app.press("text:App Store");
  expect(app.openedUrls()).toEqual(["https://apps.apple.com/app/pairidaeza/id0000000000"]);
});

test("native logout clears credentials and unrelated callbacks do not sign in", async () => {
  const bootstrap = await fixtureData();
  const app = await openApp("./App.tsx", {
    ...wideWindow,
    storage: { "pairidaeza.tokens": JSON.stringify({ accessToken: "test-session", refreshToken: null, expiresAt: null }) },
    network: { "GET */api/data/bootstrap": { body: bootstrap } },
  });
  await app.waitFor("role:button[Account]");
  await app.press("role:button[Account]");
  await app.press("text:Log out");
  await app.waitFor("Sign in to Pairidaeza");
  await app.openWithUrl("ai.lotsa.pairidaeza:/auth?code=old&state=old");
  expect(app.shows("role:button[Sign in]")).toBe(true);
  expect(app.storage()["pairidaeza.tokens"]).toBe(undefined);
});

test("account shows provider identity instead of fixture account", async () => {
  const bootstrap = await fixtureData();
  bootstrap.user = { id: "subject-1", email: "identity@example.com", name: "Identity User", emailVerified: true };
  const app = await openApp("./App.tsx", {
    ...wideWindow,
    storage: { "pairidaeza.tokens": JSON.stringify({ accessToken: "test-session", refreshToken: null, expiresAt: null }) },
    network: { "GET */api/data/bootstrap": { body: bootstrap } },
  });
  await app.waitFor("role:button[Account]");
  await app.press("role:button[Account]");
  expect(app.texts()).toContain("Identity User");
  expect(app.texts()).toContain("identity@example.com");
});

test("bootstrap failure never opens the workspace", async () => {
  const app = await openApp("./App.tsx", {
    storage: { "pairidaeza.tokens": JSON.stringify({ accessToken: "test-session", refreshToken: null, expiresAt: null }) },
    network: { "GET */api/data/bootstrap": { status: 500, body: {} } },
  });
  await app.waitFor("Error: Loading workspace failed (HTTP 500)");
  expect(app.shows("role:button[Account]")).toBe(false);
  expect(app.shows("role:button[Retry]")).toBe(true);
});

test("failed logout retains the authenticated workspace", async () => {
  const bootstrap = await fixtureData();
  const app = await openApp("./App.tsx", {
    ...wideWindow,
    platform: "web",
    network: {
      "GET */api/data/bootstrap": { body: bootstrap },
      "POST */auth/logout": { status: 500, body: {} },
    },
  });
  await app.waitFor("role:button[Account]");
  await app.press("role:button[Account]");
  await app.press("text:Log out");
  expect(app.shows("role:button[Account]")).toBe(true);
});

test("cancelling sign-in rejects a later callback and permits retry", async () => {
  let finishes = 0;
  const app = await openApp("./App.tsx", {
    modules: {
      "pairidaeza/native": {
        "NativeAuth.begin": () => JSON.stringify({ url: "https://auth.lotsa.ai/authorize", transaction: "transaction" }),
        "NativeAuth.finish": () => {
          finishes++;
          throw new Error("unexpected callback");
        },
      },
    },
  });
  await app.waitFor("Sign in to Pairidaeza");
  await app.press("role:button[Sign in]");
  await app.press("role:button[Cancel]");
  await app.openWithUrl("ai.lotsa.pairidaeza:/auth?code=late&state=late");
  expect(finishes).toBe(0);
  expect(app.shows("role:button[Sign in]")).toBe(true);
});

import { expect, open, test } from "nsh/test";

test("web bootstrap and save use cookie authentication without bearer tokens", async () => {
  const user = { id: "subject", name: "Provider User", email: "user@example.com", emailVerified: true };
  const app = await open("./api-test-app.tsx", {
    platform: "web",
    storage: { "pairidaeza.tokens": JSON.stringify({ accessToken: "old-native-token", refreshToken: null, expiresAt: null }) },
    network: {
      "GET */api/data/bootstrap": (request) => {
        expect(request.headers.authorization).toBe(undefined);
        return { body: { user, documents: { test: { revision: 0, state: { value: "initial" } } } } };
      },
      "PATCH */api/data/documents/test": (request) => {
        expect(request.headers.authorization).toBe(undefined);
        expect(request.headers["x-pairidaeza-request"]).toBe("1");
        return { body: { revision: 1, state: { value: "first" } } };
      },
    },
  });
  await app.waitFor("initial");
  await app.press("role:button[First]");
  await app.waitFor("Saved");
});

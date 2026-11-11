import { expect, open, test } from "nsh/test";

test("native expired credentials refresh before workspace load and persist rotated tokens", async () => {
  const user = { id: "subject", name: "Provider User", email: "user@example.com", emailVerified: true };
  const rotated = { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: null };
  const app = await open("./api-test-app.tsx", {
    storage: { "pairidaeza.tokens": JSON.stringify({ accessToken: "expired", refreshToken: "old-refresh", expiresAt: 0 }) },
    modules: {
      "pairidaeza/native": {
        "NativeAuth.refresh": (refreshToken: string) => {
          expect(refreshToken).toBe("old-refresh");
          return JSON.stringify(rotated);
        },
      },
    },
    network: {
      "GET */api/data/bootstrap": (request) => {
        expect(request.headers.authorization).toBe("Bearer new-access");
        return { body: { user, documents: { test: { revision: 0, state: { value: "initial" } } } } };
      },
    },
  });
  await app.waitFor("initial");
  expect(JSON.parse(app.storage()["pairidaeza.tokens"])).toEqual(rotated);
});

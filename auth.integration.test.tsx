import { expect, open, test } from "nsh/test";

test("native sign-in offers a Zitadel authorization request and can be restarted", async () => {
  const app = await open("./App.tsx", { network: "live", storage: {} });
  await app.waitFor("Sign in to Pairidaeza");
  await app.press("role:button[Sign in]");
  await app.waitFor("Complete sign-in in your browser.", { timeout: 20_000 });
  await app.waitUntil(() => app.openedUrls().some((url) => url.startsWith("https://auth.lotsa.ai/oauth/v2/authorize?")), {
    timeout: 20_000,
  });
  const urls = app.openedUrls();
  expect(urls.length).toBe(1);
  const first = new URL(urls[0]);
  expect(`${first.origin}${first.pathname}`).toBe("https://auth.lotsa.ai/oauth/v2/authorize");
  expect(first.searchParams.get("client_id")).toBe("399234353625923915");
  expect(first.searchParams.get("redirect_uri")).toBe("ai.lotsa.pairidaeza:/auth");
  expect(first.searchParams.get("response_type")).toBe("code");
  expect(first.searchParams.get("code_challenge_method")).toBe("S256");
  expect(first.searchParams.get("code_challenge")?.length).toBe(43);
  expect((first.searchParams.get("state") || "").length > 0).toBe(true);
  expect((first.searchParams.get("nonce") || "").length > 0).toBe(true);
  const scope = (first.searchParams.get("scope") || "").split(" ");
  for (const required of ["openid", "profile", "email", "offline_access", "urn:zitadel:iam:org:project:id:399106433292993198:aud"]) {
    expect(scope).toContain(required);
  }
  await app.press("role:button[Cancel]");
  await app.waitFor("role:button[Sign in]");
  expect(app.shows("Complete sign-in in your browser.")).toBe(false);
  await app.press("role:button[Sign in]");
  await app.waitFor("Complete sign-in in your browser.", { timeout: 20_000 });
  await app.waitUntil(() => app.openedUrls().length === 2, { timeout: 20_000 });
  const second = new URL(app.openedUrls()[1]);
  expect(second.searchParams.get("state") === first.searchParams.get("state")).toBe(false);
  expect(second.searchParams.get("nonce") === first.searchParams.get("nonce")).toBe(false);
  expect(second.searchParams.get("code_challenge") === first.searchParams.get("code_challenge")).toBe(false);
}, 60_000);

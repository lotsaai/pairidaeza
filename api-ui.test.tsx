import { expect, test } from "nsh/test";
import { fixtureApps } from "./test-app";

test("a UI-created bot and connected app survive a fresh UI session", async () => {
  const open = await fixtureApps();
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Create]");
  await app.press("text:New bot");
  await app.type("text:Name", "API persistence probe");
  await app.press("text:Create");
  await app.waitFor("role:button[API persistence probe]");
  await app.press("text:Connect apps");
  await app.press("role:button[Add Notion]");
  await app.press("role:button[Close integrations]");
  await app.waitFor("text:5 apps connected");

  const fresh = await open("./App.tsx", { width: 1280, height: 800 });
  await fresh.waitFor("role:button[API persistence probe]");
  await fresh.waitFor("text:5 apps connected");
  expect(fresh.texts()).toContain("API persistence probe");
});

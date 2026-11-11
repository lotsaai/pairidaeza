import { expect, test } from "nsh/test";
import { open } from "./test-app";

const wideWindow = { width: 1280, height: 800 };

test("a skill is edited, saved and deleted in two steps", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Account]");
  await app.press("text:Skills");
  await app.waitFor("Your skills");
  await app.press("text:changelog");
  await app.waitFor("label:SKILL.md");
  await app.type("label:SKILL.md", "\nExtra line.");
  await app.press("text:Save");
  await app.waitFor("Your skills");
  await app.press("text:changelog");
  await app.waitFor("label:SKILL.md");
  expect(app.value("label:SKILL.md")).toContain("Extra line.");
  await app.press("text:Delete");
  await app.waitFor("text:Confirm delete");
  await app.press("text:Confirm delete");
  await app.waitFor("Your skills");
  expect(app.texts()).not.toContain("changelog");
  await app.press("role:button[Close skills]");
});

test("a plugin skill is read-only and only closes", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Account]");
  await app.press("text:Skills");
  await app.waitFor("Your skills");
  await app.press("text:receipts");
  await app.waitFor("label:SKILL.md");
  await app.waitFor("text:Close");
  expect(app.shows("text:Save")).toBe(false);
  expect(app.shows("text:Delete")).toBe(false);
  await app.press("text:Close");
  await app.waitFor("Your skills");
});

test("artifacts open from the account menu, search, preview and delete", async () => {
  const app = await open("./App.tsx", wideWindow);
  app.onDialog((dialog) => {
    expect(dialog.title).toBe('Delete "Weekly growth review"?');
    return "Delete";
  });
  await app.press("role:button[Account]");
  await app.press("text:Artifacts");
  await app.waitFor("Weekly growth review");
  await app.press("role:button[Search artifacts]");
  await app.type("label:Search artifacts", "pricing");
  await app.waitFor("Weekly growth review", { state: "gone" });
  await app.press("role:button[Card view]");
  await app.press("label:Pricing changelog");
  await app.waitFor("Clearer seats, same prices.");
  await app.type("label:Search artifacts", "zzz");
  await app.waitFor("No matching artifacts");
  await app.press("text:Clear filters");
  await app.press("role:button[Delete Weekly growth review]");
  await app.waitFor("Weekly growth review", { state: "gone" });
});

test("invite friends copies the link", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Account]");
  await app.press("text:Invite friends");
  await app.waitFor("Give a friend 2 weeks free");
  expect(app.value("label:Invite link")).toBe("https://pairidaeza.example/sign-up?ref=ALEX42");
  await app.press("text:Copy link");
  await app.waitFor("Copied");
});

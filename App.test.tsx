import { expect, test } from "nsh/test";
import { open } from "./test-app";

test("sending a message shows it and a reply arrives", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Writer]");
  await app.type("text:Message Writer", "tighten the intro");
  await app.press("role:button[Send]");
  await app.waitFor("tighten the intro");
  await app.waitFor("on it. I'll report back here when it's done.");
  expect(app.value("text:Message Writer")).toBe("");
});

test("an approval card is answered once", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Chief of Staff]");
  await app.press("role:button[Allow once]");
  await app.waitFor("Allowed once");
  await app.waitFor("role:button[Deny]", { state: "gone" });
});

test("an option question keeps its options once answered", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Chief of Staff]");
  await app.waitFor("role:button[Plan and prioritize]");
  expect(app.enabled("role:button[Research and explain]")).toBe(false);
});

test("a reply is quoted above the message it sends", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800, platform: "macos" });
  await app.press("role:button[Chief of Staff]");
  await app.waitFor("text:Message Chief of Staff");
  await app.hover("text:what does this week look like?");
  await app.waitFor("role:button[Reply]");
  await app.press("role:button[Reply]");
  await app.waitFor("role:button[Cancel reply]");
  await app.type("text:Message Chief of Staff", "move it to Friday");
  await app.press("role:button[Send]");
  await app.waitFor("↩ You: what does this week look like?");
  await app.waitFor("role:button[Cancel reply]", { state: "gone" });
});

test("a reaction shows under its message", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800, platform: "macos" });
  await app.press("role:button[Chief of Staff]");
  await app.waitFor("text:Message Chief of Staff");
  await app.hover("text:what does this week look like?");
  await app.waitFor("role:button[React]");
  await app.press("role:button[React]");
  await app.press("role:button[🎉]");
  await app.waitFor("role:button[🎉]", { state: "gone" });
  await app.waitFor("🎉");
});

test("a new bot gets its own chat", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Create]");
  await app.press("text:New bot");
  await app.type("text:Name", "Recruiter");
  await app.press("text:Create");
  await app.waitFor("hi, I'm Recruiter. tell me what you'd like me to take on.");
  await app.waitFor("role:button[Recruiter]");
});

test("a new bot needs a name", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Create]");
  await app.press("text:New bot");
  await app.press("text:Create");
  await app.waitFor("role:button[Cancel]");
});

test("search opens a chat", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.keyboard.press("mod+k");
  await app.type("text:Search chats, bots and pages", "finance");
  await app.keyboard.press("enter");
  await app.waitFor("text:Message Finance");
});

test("a routine is created, edited and deleted from the bot panel", async () => {
  const app = await open("./App.tsx", { width: 1400, height: 900 });
  await app.press("role:button[Researcher]");
  await app.press("role:button[Researcher details]");
  await app.press("role:tab[Routines]");
  await app.waitFor("Weekly growth review");
  await app.press("role:button[New routine]");
  await app.waitFor("Not run yet");
  app.onDialog(() => "Delete");
  await app.press("role:button[Delete routine]");
  await app.waitFor("role:button[New routine]");
  await app.waitFor("Not run yet", { state: "gone" });
});

test("on a phone, bot details are a page with a way back", async () => {
  const app = await open("./App.tsx", { width: 390, height: 844 });
  await app.press("role:button[Writer]");
  await app.press("role:button[Writer details]");
  await app.waitFor("role:tab[Settings]");
  await app.press("role:button[Back]");
  await app.waitFor("text:Message Writer");
});

test("settings take over the window with sections beside the page", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Account]");
  await app.press("text:Settings");
  await app.waitFor("text:Send with Enter");
  await app.press("role:button[Usage]");
  await app.waitFor("text:Send with Enter", { state: "gone" });
  await app.press("role:button[Close settings]");
  await app.waitFor("text:Message Launch team");
  await app.press("role:button[Account]");
  await app.press("text:Settings");
  await app.press("role:button[Back to workspace]");
  await app.waitFor("text:Message Launch team");
});

test("on a phone, settings sections are pages with a way back", async () => {
  const app = await open("./App.tsx", { width: 390, height: 844 });
  await app.press("role:button[Account]");
  await app.press("text:Settings");
  await app.press("role:button[Organization]");
  await app.waitFor("text:Delete organization");
  await app.back();
  await app.waitFor("role:button[Updates]");
  await app.press("role:button[Back to workspace]");
  await app.waitFor("role:button[Account]");
});

test("connecting and removing an app updates the sidebar count", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.waitFor("text:4 apps connected");
  await app.press("text:Connect apps");
  await app.press("role:button[Add Notion]");
  await app.press("role:button[Close integrations]");
  await app.waitFor("text:5 apps connected");
  await app.press("text:Connect apps");
  await app.press("role:button[5 connected]");
  await app.press("role:button[Open Notion]");
  app.onDialog((dialog) => {
    expect(dialog.title).toBe("Remove from every space?");
    return "Remove";
  });
  await app.press("role:button[Uninstall]");
  await app.press("role:button[Close integrations]");
  await app.waitFor("text:4 apps connected");
});

test("a template makes a bot with its prompt and opens its chat", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("text:Connect apps");
  await app.press("role:button[Templates]");
  await app.press("role:button[Productivity]");
  await app.press("role:button[Open Claude Proxy]");
  await app.waitFor("text:It becomes the bot's instructions.");
  await app.press("role:button[Create bot]");
  await app.waitFor("text:Message Claude Proxy");
});

test("activity lists what needs an answer and opens its chat", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Activity]");
  await app.waitFor("text:Needs attention");
  await app.press("role:button[Chief of Staff, Needs input]");
  await app.waitFor("text:Message Chief of Staff");
  await app.press("role:button[Activity]");
  await app.waitFor("text:Needs attention", { state: "gone" });
});

test("running a routine logs the run and reports in the chat", async () => {
  const app = await open("./App.tsx", { width: 1400, height: 900 });
  await app.press("role:button[Researcher]");
  await app.press("role:button[Researcher details]");
  await app.press("role:tab[Routines]");
  await app.press("text:Weekly growth review");
  await app.press("role:button[Run now]");
  await app.waitFor("Just now");
  await app.waitFor("ran Weekly growth review. results are in the thread notes.");
});

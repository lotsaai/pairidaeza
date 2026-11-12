import { expect, test } from "nsh/test";
import { fixtureApps, open } from "./test-app";

test("mobile chat sends a message and reopens it from the chat list", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Writer]");
  await app.type("text:Message Writer", "Tighten the intro");
  await app.press("role:button[Send]");
  await app.waitFor("Tighten the intro");
  await app.waitFor("on it. I'll report back here when it's done.");
  expect(app.value("text:Message Writer")).toBe("");
  await app.press("role:button[Back]");
  await app.press("role:button[Writer]");
  await app.waitFor("Tighten the intro");
});

test("mobile approval answers once and answered options stay disabled", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Chief of Staff]");
  await app.press("role:button[Allow once]");
  await app.waitFor("Allowed once");
  await app.waitFor("role:button[Deny]", { state: "gone" });
  await app.waitFor("role:button[Plan and prioritize]");
  expect(app.enabled("role:button[Research and explain]")).toBe(false);
});

test("mobile message actions quote a reply and retain a reaction", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Chief of Staff]");
  await app.press("id:message-c2 >> role:button[React]");
  await app.waitFor("role:button[🎉]");
  await app.press("role:button[🎉]");
  await app.waitFor("role:button[🎉]", { state: "gone" });
  await app.waitFor("🎉");
  await app.press("id:message-c2 >> role:button[Reply]");
  await app.waitFor("role:button[Cancel reply]");
  await app.type("text:Message Chief of Staff", "move it to Friday");
  await app.press("role:button[Send]");
  await app.scroll("id:chat-messages", 10000);
  await app.waitFor("↩ You: what does this week look like?");
  await app.waitFor("role:button[Cancel reply]", { state: "gone" });
  await app.press("role:button[Back]");
  await app.press("role:button[Chief of Staff]");
  await app.waitFor("🎉");
});

test("mobile bot creation validates its name and survives a fresh fixture session", async () => {
  const open = await fixtureApps();
  const app = await open("./App.tsx");
  await app.press("role:button[Create]");
  await app.type("id:bot-create-picker >> text:Search", "new bot");
  await app.press("text:New bot");
  await app.waitFor("label:Bot name");
  await app.press("text:Create");
  await app.waitFor("role:button[Cancel]");
  await app.type("text:Name", "Recruiter");
  await app.press("text:Create");
  await app.waitFor("hi, I'm Recruiter. tell me what you'd like me to take on.");
  await app.press("role:button[Back]");
  await app.waitFor("role:button[Recruiter]");
  app.dispose();
  const fresh = await open("./App.tsx");
  await fresh.press("role:button[Recruiter]");
  await fresh.waitFor("text:Message Recruiter");
});

test("mobile settings sections return to the list and workspace", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Account]");
  await app.press("text:Settings");
  await app.press("role:button[Organization]");
  await app.waitFor("text:Delete organization");
  await app.back();
  await app.waitFor("role:button[Updates]");
  await app.back();
  await app.waitFor("role:button[Account]");
});

test("mobile bot details return to the conversation", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Writer]");
  await app.press("role:button[Writer details]");
  await app.waitFor("role:tab[Settings]");
  await app.press("role:button[Back]");
  await app.waitFor("text:Message Writer");
});

test("mobile sidebar search filters chats, handles no matches and opens Finance", async () => {
  const app = await open("./App.tsx");
  await app.press("role:button[Search]");
  await app.type("label:Search chats", "no-such-chat-verification");
  await app.waitFor("role:button[Writer]", { state: "gone" });
  await app.waitFor("role:button[Finance]", { state: "gone" });
  await app.clear("label:Search chats");
  await app.type("label:Search chats", "finance");
  await app.waitFor("role:button[Finance]");
  await app.press("role:button[Finance]");
  await app.waitFor("text:Message Finance");
});

test("mobile integrations install, remove and create a bot from a template", async () => {
  const app = await open("./App.tsx");
  await app.press("text:Connect apps");
  await app.press("role:button[Add Notion]");
  await app.press("role:button[Close integrations]");
  await app.waitFor("id:integrations", { state: "gone" });
  await app.waitFor("text:5 apps connected");
  await app.press("text:Connect apps");
  await app.press("role:button[5 connected]");
  await app.press("role:button[Open Notion]");
  app.onDialog(() => "Remove");
  await app.press("role:button[Uninstall]");
  await app.press("role:button[Close integrations]");
  await app.waitFor("id:integrations", { state: "gone" });
  await app.waitFor("text:4 apps connected");
  await app.press("text:Connect apps");
  await app.press("role:button[Templates]");
  await app.press("role:button[Productivity]");
  await app.press("role:button[Open Claude Proxy]");
  await app.waitFor("text:It becomes the bot's instructions.");
  await app.press("role:button[Create bot]");
  await app.waitFor("text:Message Claude Proxy");
});

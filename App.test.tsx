import { expect, open, test } from "nsh/test";

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
  await app.press("role:button[Allow]");
  await app.waitFor("Allowed");
  await app.waitFor("role:button[Deny]", { state: "gone" });
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

test("settings open from the account menu as their own stack", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Account]");
  await app.press("text:Settings");
  await app.press("text:Connected apps");
  await app.waitFor("text:Slack");
  await app.press("role:switch[Slack]");
  await app.press("role:button[Back]");
  await app.waitFor("4 connected");
  await app.press("role:button[Close settings]");
  await app.waitFor("4 apps connected");
});

test("the header menu clears a chat after asking", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  app.onDialog((dialog) => {
    expect(dialog.title).toBe('Clear "Launch team"?');
    return "Clear history";
  });
  await app.press("role:button[Chat options]");
  await app.press("text:Clear history…");
  await app.waitFor("Sources are in the thread notes.", { state: "gone" });
});

test("a pinned chat offers Unpin, and unpinning restores Pin", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Writer]");
  await app.press("role:button[Chat options]");
  await app.press("text:Pin");
  await app.press("role:button[Chat options]");
  await app.press("text:Unpin");
  await app.press("role:button[Chat options]");
  await app.waitFor("text:Pin");
});

test("an attached file goes out with the message", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Add]");
  await app.press("text:Attach file");
  await app.waitFor("role:button[Remove Q3 report.pdf]");
  await app.press("role:button[Send]");
  await app.waitFor("📎 Q3 report.pdf");
  await app.waitFor("role:button[Remove Q3 report.pdf]", { state: "gone" });
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

test("a snoozed chat leaves the list for the Snoozed shelf until unsnoozed", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Writer]");
  await app.press("role:button[Chat options]");
  await app.press("text:Snooze");
  await app.press("text:Tomorrow");
  await app.waitFor("role:button[Writer]", { state: "gone" });
  await app.press("role:button[Snoozed]");
  await app.press("role:button[Unsnooze Writer]");
  await app.waitFor("role:button[Writer]");
  await app.waitFor("role:button[Snoozed]", { state: "gone" });
});

test("a chat moves into a new section", async () => {
  const app = await open("./App.tsx", { width: 1280, height: 800 });
  await app.press("role:button[Sales]");
  await app.press("role:button[Chat options]");
  await app.press("text:Move to");
  await app.press("text:New section…");
  await app.type("text:Section name", "Revenue");
  await app.press("text:Create");
  await app.waitFor("role:button[Revenue]");
  await app.press("role:button[Revenue]");
  await app.waitFor("role:button[Sales]", { state: "gone" });
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

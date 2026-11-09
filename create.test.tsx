import { open, test } from "nsh/test";

test("a group needs a name and two bots", async () => {
  const app = await open("./App.tsx", { width: 1400, height: 900 });
  await app.press("role:button[Create]");
  await app.press("text:New group chat");
  await app.press("role:button[Create group]");
  await app.waitFor("text:Members (0)");
  await app.type("label:Name", "Launch crew");
  await app.press("role:checkbox[Add Writer group]");
  await app.press("role:checkbox[Add Researcher group]");
  await app.waitFor("text:Members (2)");
  await app.press("role:button[Create group]");
  await app.waitFor("text:Launch crew");
  await app.waitFor("text:New group", { state: "gone" });
});

test("filtering bots can leave none", async () => {
  const app = await open("./App.tsx", { width: 1400, height: 900 });
  await app.press("role:button[Create]");
  await app.press("text:New group chat");
  await app.type("text:Filter bots", "zzz");
  await app.waitFor("text:No bots match");
});

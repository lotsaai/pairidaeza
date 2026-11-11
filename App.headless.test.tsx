import { expect, test } from "nsh/test";
import { open } from "./test-app";

test("desktop attachments can be removed before sending arbitrary files", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 800 });
  await app.press("role:button[Writer]");
  app.onPick((pick) => {
    expect(pick.kind).toBe("files");
    return [
      { name: "brief.pdf", type: "application/pdf", data: new Uint8Array([1]) },
      { name: "notes.txt", type: "text/plain", data: new Uint8Array([2]) },
    ];
  });
  await app.type("text:Message Writer", "Please review");
  await app.press("role:button[Attach file]");
  await app.waitFor("role:button[Remove brief.pdf]");
  await app.waitFor("role:button[Remove notes.txt]");
  await app.press("role:button[Remove notes.txt]");
  await app.waitFor("role:button[Remove notes.txt]", { state: "gone" });
  await app.press("role:button[Send]");
  await app.waitFor("📎 brief.pdf\nPlease review");
  await app.waitFor("role:button[Remove brief.pdf]", { state: "gone" });
  expect(app.shows("📎 notes.txt")).toBe(false);
});

test("mobile photo and file choices preserve attachments and draft on cancellation", async () => {
  const app = await open("./App.tsx", { platform: "ios", width: 390, height: 844 });
  await app.press("role:button[Writer]");
  app.onPick((pick) =>
    pick.kind === "images"
      ? [{ name: "Whiteboard.jpg", type: "image/jpeg", data: new Uint8Array([1]) }]
      : [{ name: "brief.pdf", type: "application/pdf", data: new Uint8Array([2]) }],
  );
  await app.type("text:Message Writer", "See these");
  await app.press("role:button[Attach file]");
  await app.press("text:Photo library…");
  await app.waitFor("role:button[Remove Whiteboard.jpg]");
  await app.press("role:button[Attach file]");
  await app.press("text:Browse files…");
  await app.waitFor("role:button[Remove brief.pdf]");
  app.onPick(() => null);
  await app.press("role:button[Attach file]");
  await app.press("text:Browse files…");
  await app.waitFor("role:button[Remove Whiteboard.jpg]");
  await app.waitFor("role:button[Remove brief.pdf]");
  await app.press("role:button[Send]");
  await app.waitFor("📎 Whiteboard.jpg\n📎 brief.pdf\nSee these");
});

test("selecting the same attachment twice keeps one removable chip", async () => {
  const app = await open("./App.tsx", { platform: "macos", width: 1280, height: 800 });
  await app.press("role:button[Writer]");
  app.onPick(() => [{ name: "brief.pdf", type: "application/pdf", data: new Uint8Array([1]) }]);
  await app.press("role:button[Attach file]");
  await app.waitFor("role:button[Remove brief.pdf]");
  await app.press("role:button[Attach file]");
  await app.press("role:button[Remove brief.pdf]");
  await app.waitFor("role:button[Remove brief.pdf]", { state: "gone" });
});

import { expect, test } from "nsh/test";
import { open } from "./test-app";
import {
  activityAttention,
  appliedFilters,
  emptyFilters,
  resolveDrop,
  rowAt,
  runMatches,
  sidebarGroups,
  STUCK_AFTER_MS,
} from "./pages/sidebar/logic";

const wideWindow = { width: 1280, height: 800 };

test("the + menu filters bots, and New bot hides unless the query matches it", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Create]");
  await app.waitFor("text:New group chat");
  await app.waitFor("text:New private space");
  await app.type("id:bot-create-picker", "zzz");
  await app.waitFor("text:New bot", { state: "gone" });
  expect(app.shows("text:New group chat")).toBe(true);
  await app.clear("id:bot-create-picker");
  await app.type("id:bot-create-picker", "new");
  await app.waitFor("text:New bot");
});

test("New private space opens its dialog from the + menu", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Create]");
  await app.press("text:New private space");
  await app.waitFor("text:New space");
});

test("Escape closes the search field", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Search]");
  await app.waitFor("label:Search chats");
  await app.keyboard.press("escape");
  await app.waitFor("label:Search chats", { state: "gone" });
});

test("activity filters show as chips, narrow the runs and reset together", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Activity]");
  await app.press("role:button[Search]");
  await app.press("role:button[Filters]");
  // The 15th of next month: later than every run, so nothing matches.
  const next = new Date();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const day = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-15`;
  await app.press("label:From");
  await app.press("role:button[Next month]");
  await app.press("text:15");
  await app.waitFor(`text:From ${day}`);
  await app.waitFor("text:No runs match these filters.");
  await app.press("text:Reset all");
  await app.waitFor("text:No runs match these filters.", { state: "gone" });
  await app.waitFor("text:Needs attention");
  await app.type("label:Search runs", "vendor");
  await app.waitFor("text:Search: vendor");
  await app.press("role:button[Clear Search: vendor]");
  await app.waitFor("text:Search: vendor", { state: "gone" });
});

test("Alt+Up moves a bot row up within its group, and stops at the top", async () => {
  const app = await open("./App.tsx", wideWindow);
  // The list's texts may come bottom row first, so the Chats header says which way they run.
  const above = (a: string, b: string) => {
    const texts = app.texts();
    return texts.indexOf(a) < texts.indexOf(b) === texts.indexOf("Chats") < texts.indexOf("Sales");
  };
  await app.press("role:button[Writer]");
  expect(above("Researcher", "Writer")).toBe(true);
  await app.keyboard.press("alt+up");
  await app.waitUntil(() => above("Writer", "Researcher"));
  await app.keyboard.press("alt+up");
  await app.keyboard.press("alt+up");
  await app.keyboard.press("alt+up");
  await app.waitUntil(() => above("Writer", "Inbox"));
  await app.keyboard.press("alt+up");
  expect(above("Writer", "Inbox")).toBe(true);
});

test("dragging a bot row above another reorders them", async () => {
  const app = await open("./App.tsx", { ...wideWindow, platform: "macos" });
  const above = (a: string, b: string) => {
    const texts = app.texts();
    return texts.indexOf(a) < texts.indexOf(b) === texts.indexOf("Chats") < texts.indexOf("Sales");
  };
  expect(above("Researcher", "Writer")).toBe(true);
  await app.drag("role:button[Writer]", { y: -64 });
  await app.waitUntil(() => above("Writer", "Researcher"));
});

test("the toggle folds the sidebar to a rail of tiles and back", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.waitFor("role:button[Operations]");
  await app.press("role:button[Minimize bots]");
  await app.waitFor("role:button[Show bots]");
  await app.waitFor("role:button[Operations]", { state: "gone" });
  await app.waitFor("role:button[Writer]");
  await app.press("role:button[Show bots]");
  await app.waitFor("role:button[Operations]");
});

test("dragging the sidebar's edge below the snap width folds it to the rail", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.drag("label:Resize bots sidebar", { x: -250 });
  await app.waitFor("role:button[Show bots]");
});

test("dragging the details panel's edge resizes it and saves the width", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Launch team details]");
  await app.drag("label:Resize details panel", { x: -100 });
  await app.waitUntil(() => app.storage()["pairidaeza.panelWidth"] === "484");
});

test("with several spaces, headers name the space, and its actions delete it", async () => {
  const app = await open("./App.tsx", wideWindow);
  await app.press("role:button[Create]");
  await app.press("text:New private space");
  await app.type("label:Name", "Support");
  await app.press("role:button[Create space]");
  await app.waitFor("role:button[Actions for Support]");
  await app.waitFor("role:button[Personal, Pinned]");
  expect(app.shows("role:button[Actions for Personal]")).toBe(true);
  app.onDialog((dialog) => {
    expect(dialog.title).toBe('Delete "Support"?');
    return "Delete space";
  });
  await app.press("role:button[Actions for Support]");
  await app.press("text:Delete space");
  await app.waitFor("role:button[Actions for Support]", { state: "gone" });
});

test("activityAttention: failed counts only when unread, queued only once it is old", () => {
  const now = Date.now();
  expect(activityAttention({ status: "failed", at: now }, false, now)).toBe(null);
  expect(activityAttention({ status: "failed", at: now }, true, now)).toBe("needs_attention");
  expect(activityAttention({ status: "queued", at: now }, false, now)).toBe("working");
  expect(activityAttention({ status: "queued", at: now - STUCK_AFTER_MS }, false, now)).toBe("needs_attention");
  expect(activityAttention({ status: "waiting_input", at: now }, false, now)).toBe("needs_attention");
  expect(activityAttention({ status: "completed", at: now }, true, now)).toBe("unread");
});

test("filters apply by text, status and dates; a typed date that is not one filters nothing", () => {
  const at = Date.parse("2026-03-10T12:00:00");
  const run = { status: "completed" as const, at };
  const f = (patch: object) => appliedFilters({ ...emptyFilters(), ...patch });
  expect(runMatches(run, "inbox drafted", f({ query: "DRAFTED" }))).toBe(true);
  expect(runMatches(run, "inbox drafted", f({ status: "failed" }))).toBe(false);
  expect(runMatches(run, "", f({ from: "2026-03-10", to: "2026-03-10" }))).toBe(true);
  expect(runMatches(run, "", f({ from: "2026-03-11" }))).toBe(false);
  expect(runMatches(run, "", f({ to: "2026-03-09" }))).toBe(false);
  expect(f({ from: "2026-03" }).from).toBe("");
});

test("drops: reorder among siblings, move to a section, join a group, never across pinned or spaces", () => {
  const bot = { id: "a", botId: "a", spaceId: "s", pinned: false, sectionId: null };
  const sibling = { kind: "bot" as const, id: "b", spaceId: "s", pinned: false, sectionId: null };
  expect(resolveDrop(bot, sibling, 10)).toEqual({ action: "reorder", targetId: "b" });
  expect(resolveDrop(bot, { ...sibling, sectionId: "ops" }, 10)).toEqual({ action: "move", sectionId: "ops" });
  expect(resolveDrop(bot, { ...sibling, pinned: true }, 10)).toBe(null);
  expect(resolveDrop(bot, { ...sibling, spaceId: "t" }, 10)).toBe(null);
  expect(resolveDrop(bot, { kind: "section", spaceId: "s", sectionId: "ops" }, 10)).toEqual({ action: "move", sectionId: "ops" });
  expect(resolveDrop({ ...bot, pinned: true }, { kind: "section", spaceId: "s", sectionId: "ops" }, 10)).toBe(null);
  const group = { kind: "group" as const, id: "g", spaceId: "s", memberIds: ["x", "y"] };
  expect(resolveDrop(bot, group, 10)).toEqual({ action: "join", groupId: "g" });
  expect(resolveDrop(bot, group, 2)).toBe(null);
  expect(resolveDrop(bot, { ...group, memberIds: ["a", "y"] }, 10)).toBe(null);
});

test("rowAt finds the row a drag ends over", () => {
  const heights = [36, 64, 64, 64];
  expect(rowAt(heights, 2, 0)).toBe(2);
  expect(rowAt(heights, 2, -64)).toBe(1);
  expect(rowAt(heights, 2, -200)).toBe(0);
  expect(rowAt(heights, 1, 500)).toBe(3);
});

test("with several spaces a group keeps its space name over the section, and an empty space keeps a header", () => {
  const member = { id: "u", name: "A", email: "a@x", role: "owner" as const };
  const spaces = [
    { id: "p", name: "Personal", isDefault: true, members: [member], openInvites: 0 },
    { id: "q", name: "Support", isDefault: false, members: [member], openInvites: 0 },
  ];
  const chat = { id: "c", botIds: ["c"], title: "C", preview: "", time: "", spaceId: "p" };
  const groups = sidebarGroups({ spaces, chats: [chat], sections: [{ id: "s1", spaceId: "p", name: "Ops" }], query: "" });
  expect(groups.map((g) => [g.title, g.subtitle, g.firstOfSpace])).toEqual([
    ["Personal", "Ops", true],
    ["Personal", "Chats", false],
    ["Support", undefined, true],
  ]);
  expect(groups[2].kind).toBe("empty");
});

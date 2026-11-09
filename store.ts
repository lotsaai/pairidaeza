// Mock data; signals stay private, screens read and change them through these functions.
import { batch, setColorScheme, signal } from "nsh";

export type ComputerMode = "team" | "private" | "off";

export interface Bot {
  id: string;
  name: string;
  /** Identity color: data, not a theme role. */
  color: string;
  instructions: string;
  model: string;
  notifyOnFinish: boolean;
  computer: ComputerMode;
}

export interface Chat {
  id: string;
  /** One bot, or a group chat's 2–10. */
  botIds: string[];
  title: string;
  preview: string;
  time: string;
  /** The space it belongs to. */
  spaceId: string;
  pinned?: boolean;
  unread?: boolean;
  archived?: boolean;
  /** The user's section, or none (the Chats group). */
  sectionId?: string | null;
  /** Wake time in ms: out of the list until then, marked woken after until opened. */
  snoozedUntil?: number | null;
}

/** A user-named group of chats in one space's part of the sidebar. */
export interface Section {
  id: string;
  spaceId: string;
  name: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
}

/** A privacy boundary with its own bots, groups and sections; shared once more than one person belongs. */
export interface Space {
  id: string;
  name: string;
  isDefault: boolean;
  members: Member[];
  /** Invite links not used yet. */
  openInvites: number;
}

export interface Organization {
  id: string;
  name: string;
}

/** A SKILL.md the bots can use; plugin skills are read-only. */
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  source: "user" | "plugin";
}

/** A file a bot made. */
export interface Artifact {
  id: string;
  name: string;
  description: string;
  mimeType: string;
  version: number;
  versionCount: number;
  botId: string;
  /** ms */
  createdAt: number;
  /** The file's text, for previews (markdown, text, html). */
  content: string;
}

/** Group chats hold this many bots. */
export const GROUP_MEMBER_MIN = 2;
export const GROUP_MEMBER_MAX = 10;
export const GROUP_NAME_MAX_LENGTH = 80;
export const SPACE_NAME_MAX_LENGTH = 60;

export interface Routine {
  id: string;
  botId: string;
  name: string;
  instruction: string;
  schedule: string;
  active: boolean;
  runs: string[];
}

export interface Page {
  id: string;
  botId: string;
  title: string;
  updated: string;
  markdown: string;
}

export type RunStatus = "queued" | "running" | "waiting_input" | "waiting_takeover" | "completed" | "failed" | "cancelled";

/** One piece of a bot's work, as Activity lists it. */
export interface Run {
  id: string;
  chatId: string;
  botId: string;
  status: RunStatus;
  summary: string;
  time: string;
  /** Last change, ms: dates filter on it, and queued or waiting work this old counts as stuck. */
  at: number;
}

export type Appearance = "system" | "light" | "dark";

export type ApprovalMode = "never" | "auto" | "ask";

/** The message a reply quotes. */
export interface Reply {
  author: string;
  text: string;
}

/** An answer a bot's card offers. */
export interface AskAction {
  id: string;
  label: string;
}

/** A question with lettered options, an approval to run something, or a proposed change to a bot's instructions. */
export type AskVariant = "options" | "approval" | "instructions";

export type Message = (
  | { id: string; kind: "date"; label: string }
  | { id: string; kind: "user"; text: string; reply?: Reply }
  | { id: string; kind: "bot"; botId: string; markdown: string }
  | { id: string; kind: "tool"; botId: string; label: string }
  | {
      id: string;
      kind: "ask";
      botId: string;
      variant: AskVariant;
      text: string;
      /** The action's details, or the proposed instructions. */
      detail?: string;
      actions: AskAction[];
      /** The chosen action's id, once answered. */
      answer?: string;
    }
) & {
  /** Emoji people reacted with, and how many each. */
  reactions?: Record<string, number>;
};

/** Body colors a new bot can take. */
export const botColors = ["#3EC5A8", "#F5A03C", "#6A6BF5", "#9B5CF6", "#3B82F6", "#F2622A", "#D9508A"];

/** Models a bot can run on. */
export const models = [
  { value: "default", title: "Account default" },
  { value: "fast", title: "Fast" },
  { value: "balanced", title: "Balanced" },
  { value: "deep", title: "Deep thinking" },
];

const bot = (id: string, name: string, color: string, instructions: string): Bot => ({
  id,
  name,
  color,
  instructions,
  model: "default",
  notifyOnFinish: true,
  computer: "team",
});

const bots = signal<Bot[]>([
  bot("chief", "Chief of Staff", "#F2622A", "Keep my week on track. Flag what needs a decision from me, handle the rest."),
  bot("inbox", "Inbox", "#9B5CF6", "Triage my email. Archive noise, draft routine replies, never send without asking."),
  bot("researcher", "Researcher", "#3B82F6", "Dig through support, sales calls and analytics. Cite sources."),
  bot("writer", "Writer", "#D9508A", "Write short, plain copy in our voice. No buzzwords."),
  bot("sales", "Sales", "#3EC5A8", "Research accounts and draft outreach. Keep the CRM current."),
  bot("finance", "Finance", "#F5A03C", "File receipts, reconcile the card, flag anything over budget."),
  bot("triage", "Bug Triage", "#6A6BF5", "Label new issues, close duplicates, reproduce what you can."),
]);

const chats = signal<Chat[]>(
  (
    [
      {
        id: "chief",
        botIds: ["chief"],
        title: "Chief of Staff",
        preview: "three things matter this week: Board deck is due Thursday.",
        time: "8:32 AM",
        pinned: true,
        unread: true,
      },
      {
        id: "inbox",
        botIds: ["inbox"],
        title: "Inbox",
        preview: "sent. the other 8 drafts are waiting in Drafts.",
        time: "7:14 AM",
        unread: true,
      },
      {
        id: "researcher",
        botIds: ["researcher"],
        title: "Researcher",
        preview: "here's the weekly growth review. best week since March.",
        time: "9:04 AM",
      },
      { id: "writer", botIds: ["writer"], title: "Writer", preview: "cut it to 284 words. kept the customer quote.", time: "Fri" },
      { id: "sales", botIds: ["sales"], title: "Sales", preview: "done. 40 accounts researched, 18 drafts ready.", time: "Yesterday" },
      {
        id: "finance",
        botIds: ["finance"],
        title: "Finance",
        preview: "filed. 9 receipts, €1,284 total, nothing outstanding.",
        time: "Yesterday",
        sectionId: "ops",
      },
      {
        id: "triage",
        botIds: ["triage"],
        title: "Bug Triage",
        preview: "12 new issues: 3 duplicates closed, 2 reproduced.",
        time: "Fri",
        sectionId: "ops",
      },
      {
        id: "launch",
        botIds: ["researcher", "writer", "sales"],
        title: "Launch team",
        preview: "checked. nothing in the note contradicts what we quote.",
        time: "9:55 AM",
      },
    ] satisfies Omit<Chat, "spaceId">[]
  ).map((c): Chat => ({ ...c, spaceId: "personal" })),
);

const routines = signal<Routine[]>([
  {
    id: "r1",
    botId: "inbox",
    name: "Morning sweep",
    instruction: "Archive newsletters and receipts, draft replies to anything routine, and send me a short summary of what needs me.",
    schedule: "Weekdays at 7:00 AM",
    active: true,
    runs: ["Nov 6, 7:00 AM", "Nov 5, 7:00 AM", "Nov 4, 7:00 AM"],
  },
  {
    id: "r2",
    botId: "chief",
    name: "Monday plan",
    instruction: "Look at my calendar and open threads, and tell me the three things that matter this week.",
    schedule: "Mondays at 8:30 AM",
    active: true,
    runs: ["Nov 2, 8:30 AM", "Oct 26, 8:30 AM"],
  },
  {
    id: "r3",
    botId: "researcher",
    name: "Weekly growth review",
    instruction: "Refresh the growth review page from billing, analytics and the support queue.",
    schedule: "Mondays at 9:00 AM",
    active: false,
    runs: ["Nov 2, 9:00 AM"],
  },
]);

const pages = signal<Page[]>([
  {
    id: "p1",
    botId: "researcher",
    title: "Weekly growth review",
    updated: "Monday",
    markdown:
      "## Week of Nov 2\n\n| Metric | This week | Change |\n| --- | ---: | ---: |\n| New Team signups | 412 | +18% |\n| Annual share | 31% | +19 pts |\n| Churned seats | 37 | −6% |\n\nBest week since March. Annual pricing is doing the work.",
  },
  {
    id: "p2",
    botId: "researcher",
    title: "Pricing feedback",
    updated: "Today",
    markdown:
      "## What customers say\n\n- Seat math is confusing: guests count or not?\n- Annual discount is clear and liked.\n- Teams over 40 think Business is cheap.",
  },
  {
    id: "p3",
    botId: "chief",
    title: "Board deck outline",
    updated: "Yesterday",
    markdown: "1. Where we are\n2. Pricing changes and early results\n3. Hiring plan\n4. Asks",
  },
  {
    id: "p4",
    botId: "sales",
    title: "Accounts watch",
    updated: "Fri",
    markdown: "- **Orbit**: renewal in 30 days\n- **Northwind**: asked about guests",
  },
]);

/** Today at `h:m`, or `daysAgo` days before, in ms. */
function at(h: number, m: number, daysAgo = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

const sections = signal<Section[]>([{ id: "ops", spaceId: "personal", name: "Operations" }]);

const me: Member = { id: "u1", name: "Alex Rivera", email: "alex@example.com", role: "owner" };

const spaces = signal<Space[]>([{ id: "personal", name: "Personal", isDefault: true, members: [me], openInvites: 0 }]);

const organizations = signal<Organization[]>([
  { id: "o1", name: "Alex Rivera" },
  { id: "o2", name: "Northwind" },
]);
const activeOrganizationId = signal("o1");

/** Newest first. */
const runs = signal<Run[]>([
  {
    id: "run1",
    chatId: "launch",
    botId: "sales",
    status: "running",
    summary: "checking the Business tier notes",
    time: "9:55 AM",
    at: at(9, 55),
  },
  {
    id: "run2",
    chatId: "chief",
    botId: "chief",
    status: "waiting_input",
    summary: "needs your OK to reply to the vendor",
    time: "8:32 AM",
    at: at(8, 32),
  },
  { id: "run3", chatId: "inbox", botId: "inbox", status: "completed", summary: "drafted 8 replies", time: "7:14 AM", at: at(7, 14) },
  {
    id: "run4",
    chatId: "researcher",
    botId: "researcher",
    status: "completed",
    summary: "finished Daily metrics",
    time: "7:00 AM",
    at: at(7, 0),
  },
  {
    id: "run5",
    chatId: "triage",
    botId: "triage",
    status: "failed",
    summary: "couldn't reach the issue tracker",
    time: "Fri",
    at: at(16, 10, 3),
  },
  {
    id: "run6",
    chatId: "finance",
    botId: "finance",
    status: "cancelled",
    summary: "stopped before filing",
    time: "Yesterday",
    at: at(18, 2, 1),
  },
]);

const skills = signal<Skill[]>([
  {
    id: "k1",
    name: "changelog",
    description: "Write release notes in our voice from merged PRs.",
    content:
      "---\nname: changelog\ndescription: Write release notes in our voice from merged PRs.\n---\n\n# Changelog\n\nLead with what changed for the customer. One line each. No buzzwords.\n",
    source: "user",
  },
  {
    id: "k2",
    name: "receipts",
    description: "File receipts from email into the expense sheet.",
    content:
      "---\nname: receipts\ndescription: File receipts from email into the expense sheet.\n---\n\n# Receipts\n\nMatch each receipt to a card charge before filing it.\n",
    source: "plugin",
  },
]);

const artifacts = signal<Artifact[]>([
  {
    id: "a1",
    name: "Weekly growth review",
    description: "Signups, annual share and churn for the week of Nov 2.",
    mimeType: "text/markdown",
    version: 3,
    versionCount: 3,
    botId: "researcher",
    createdAt: at(9, 4),
    content:
      "## Week of Nov 2\n\n| Metric | This week | Change |\n| --- | ---: | ---: |\n| New Team signups | 412 | +18% |\n| Annual share | 31% | +19 pts |\n",
  },
  {
    id: "a2",
    name: "Pricing changelog",
    description: "Clearer seats, same prices.",
    mimeType: "text/markdown",
    version: 1,
    versionCount: 1,
    botId: "writer",
    createdAt: at(9, 50),
    content: "**Clearer seats, same prices.** Guests never count as seats, and the billing page now shows exactly who does.",
  },
  {
    id: "a3",
    name: "October receipts",
    description: "9 receipts, €1,284 total.",
    mimeType: "text/csv",
    version: 1,
    versionCount: 1,
    botId: "finance",
    createdAt: at(18, 0, 1),
    content: "date,vendor,amount\n2026-10-03,Figma,45.00\n2026-10-07,AWS,812.40\n",
  },
]);

/** Signed in, until Log out. */
const signedIn = signal(true);

/** Now, as of the last snooze change or wake: what snoozed and woken read. */
const clock = signal(Date.now());

const account = signal({ name: me.name, email: me.email });
const appearance = signal<Appearance>("system");
const defaultModel = signal("balanced");

/** The account's preferences beyond appearance: one record so Settings reads and writes them alike. */
export interface Preferences {
  botStyle: "original" | "pairidaeza";
  language: string;
  timezone: string;
  sendWithEnter: boolean;
  streamReplies: boolean;
  showToolActivity: boolean;
  loadWebImages: boolean;
  letBotsUseComputer: boolean;
  autoUpdate: boolean;
}
const preferences = signal<Preferences>({
  botStyle: "original",
  language: "en",
  timezone: "America/Los_Angeles",
  sendWithEnter: true,
  streamReplies: false,
  showToolActivity: true,
  loadWebImages: false,
  letBotsUseComputer: true,
  autoUpdate: true,
});
export const currentPreferences = () => preferences();
export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  preferences.update((p) => ({ ...p, [key]: value }));
}

export const appVersion = "0.8.0";

const messages = signal<Record<string, Message[]>>({
  chief: [
    { id: "c0", kind: "date", label: "Yesterday 4:35 PM" },
    {
      id: "c0a",
      kind: "ask",
      botId: "chief",
      variant: "options",
      text: "Hi Alex—what would you like Chief of Staff to help with?",
      actions: [
        { id: "plan", label: "Plan and prioritize" },
        { id: "research", label: "Research and explain" },
        { id: "draft", label: "Draft and review" },
        { id: "other", label: "Something else" },
      ],
      answer: "plan",
    },
    { id: "c1", kind: "date", label: "Today 8:31 AM" },
    { id: "c2", kind: "user", text: "what does this week look like?" },
    {
      id: "c3",
      kind: "bot",
      botId: "chief",
      markdown:
        "three things matter this week:\n\n1. **Board deck** is due Thursday. Finance has the October close ready; I booked you 2 hours Wednesday morning.\n2. **Helix Labs renewal.** Usage is down 30%. Sales has a call with them Tuesday at 2.\n3. **Hiring.** Two final-round candidates for the design role, Tuesday and Friday.\n\nI moved the vendor sync to next week to make room.",
    },
    { id: "c4", kind: "tool", botId: "chief", label: "Moved “Vendor sync” to Tue, Nov 17" },
    {
      id: "c5",
      kind: "ask",
      botId: "chief",
      variant: "approval",
      text: "Send email",
      detail: "To: vendor-team@example.com\n“Moving our sync to next Tuesday, same time.”",
      actions: [
        { id: "allow", label: "Allow once" },
        { id: "always", label: "Always allow this tool" },
        { id: "deny", label: "Deny" },
      ],
    },
    {
      id: "c6",
      kind: "ask",
      botId: "chief",
      variant: "instructions",
      text: "Update instructions?",
      detail: "Keep my week to three priorities. Ask before sending anything outside the team.",
      actions: [
        { id: "allow", label: "Apply" },
        { id: "edit", label: "Edit" },
        { id: "deny", label: "Dismiss" },
      ],
    },
  ],
  launch: [
    { id: "l1", kind: "date", label: "Today 9:40 AM" },
    {
      id: "l2",
      kind: "user",
      text: "@Researcher what did customers say about the new pricing this week? @Writer turn it into a short changelog note when it's in.",
    },
    {
      id: "l3",
      kind: "bot",
      botId: "researcher",
      markdown:
        "read 214 support threads, 37 sales calls and the pricing survey.\n\n1. **Annual discount lands.** 31% of new Team signups picked annual, up from 12%.\n2. **Seat math confuses people.** 18 tickets asked whether guests count as seats.\n3. **Business plan is underpriced** for teams over 40, per four sales calls.\n\nSources are in the thread notes.",
    },
    {
      id: "l4",
      kind: "bot",
      botId: "writer",
      markdown:
        "draft for the changelog:\n\n> **Clearer seats, same prices.** Guests never count as seats, and the billing page now shows exactly who does. Annual plans still save two months.\n\nwant it shorter, or should @Sales check it against the Business tier notes first?",
    },
    { id: "l5", kind: "user", text: "looks good. @Sales sanity check the business tier bit" },
    {
      id: "l6",
      kind: "bot",
      botId: "sales",
      markdown:
        "checked. nothing in the note contradicts what we quote on calls. Orbit and Northwind both asked about guests, so this answers them too.",
    },
  ],
});

/** The message each chat was marked unread from: a divider shows before it until the chat is opened again. */
const unreadMarkers = signal<Record<string, string>>({});
export const unreadMarker = (chatId: string) => unreadMarkers()[chatId];

const approvalMode = signal<ApprovalMode>("auto");
let nextId = 1;

/** Chats not archived (tracked where read). */
export const allChats = () => chats().filter((c) => !c.archived);
export const archivedChats = () => chats().filter((c) => c.archived);

/** Snoozed into the future (tracked where read). */
export const isSnoozed = (chat: Chat) => chat.snoozedUntil != null && chat.snoozedUntil > clock();
/** Back from a snooze, until opened (tracked where read). */
export const hasWoken = (chat: Chat) => chat.snoozedUntil != null && chat.snoozedUntil <= clock();

/** Chats the sidebar lists: not archived, not snoozed (tracked where read). */
export const listedChats = () => allChats().filter((c) => !isSnoozed(c));
export const snoozedChats = () => allChats().filter(isSnoozed);

export const allSections = () => sections();

/** Every run, newest first (tracked where read). */
export const allRuns = () => runs();

/** A chat's newest run, or undefined (tracked where read). */
export const latestRun = (chatId: string) => runs().find((r) => r.chatId === chatId);

export const currentAccount = () => account();
export const currentAppearance = () => appearance();
export const currentDefaultModel = () => defaultModel();

export function setAppearance(value: Appearance) {
  appearance.set(value);
  setColorScheme(value);
}

export function setDefaultModel(value: string) {
  defaultModel.set(value);
}

export function renameAccount(name: string) {
  account.update((a) => ({ ...a, name }));
}

function patchChat(id: string, patch: Partial<Chat>) {
  chats.update((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export const setChatPinned = (id: string, pinned: boolean) => patchChat(id, { pinned });
export const setChatUnread = (id: string, unread: boolean) => patchChat(id, { unread });
export const setChatArchived = (id: string, archived: boolean) => patchChat(id, { archived, pinned: false });
export const setChatSection = (id: string, sectionId: string | null) => patchChat(id, { sectionId, pinned: false });

/** Opening a chat reads it and ends a finished snooze. */
export function markOpened(id: string) {
  const chat = chatById(id);
  if (!chat) return;
  batch(() => {
    patchChat(id, { unread: false, snoozedUntil: hasWoken(chat) ? null : chat.snoozedUntil });
    unreadMarkers.update(({ [id]: _, ...rest }) => rest);
  });
}

/** Marks a chat unread from one message on: the sidebar shows it unread and a divider shows before the message. */
export function markMessageUnread(chatId: string, messageId: string) {
  batch(() => {
    patchChat(chatId, { unread: true });
    unreadMarkers.update((all) => ({ ...all, [chatId]: messageId }));
  });
}

/** Snoozes a chat until `until` (ms), or wakes it with null; the list redraws when it wakes. */
export function snoozeChat(id: string, until: number | null) {
  batch(() => {
    patchChat(id, { snoozedUntil: until, pinned: false });
    clock.set(Date.now());
  });
  if (until !== null) setTimeout(() => clock.set(Date.now()), Math.max(0, until - Date.now()));
}

/** Adds a section at the end of a space's sections; returns its id. */
export function createSection(name: string, spaceId = currentSpaceId()): string {
  const id = `s${nextId++}`;
  sections.update((all) => [...all, { id, spaceId, name: name.trim() }]);
  return id;
}

/** Moves `sourceId` to `targetId`'s place in the order (array order is the sidebar order). */
export function reorderChat(sourceId: string, targetId: string) {
  chats.update((all) => {
    const from = all.findIndex((c) => c.id === sourceId);
    const to = all.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0 || from === to) return all;
    const next = [...all];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

// Spaces

/** The space new bots, groups and sections go into. */
const currentSpace = signal("personal");
export const currentSpaceId = () => currentSpace();
export const allSpaces = () => spaces();
export const spaceById = (id: string) => spaces().find((s) => s.id === id);
/** More than one person belongs. */
export const isShared = (space: Space) => space.members.length > 1;
export const setCurrentSpace = (id: string) => currentSpace.set(id);
/** Bots whose own chat is in `spaceId`, not archived (tracked where read). */
export const botsInSpace = (spaceId: string) =>
  bots().filter((b) => chats().some((c) => c.id === b.id && c.spaceId === spaceId && !c.archived));

/** Creates a private space with only the user in it and makes it current; returns its id. */
export function createSpace(name: string): string {
  const id = `space${nextId++}`;
  batch(() => {
    spaces.update((all) => [...all, { id, name: name.trim(), isDefault: false, members: [me], openInvites: 0 }]);
    currentSpace.set(id);
  });
  return id;
}

export function renameSpace(id: string, name: string) {
  spaces.update((all) => all.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
}

/** Deletes a space and everything in it; the default space can't be deleted. */
export function deleteSpace(id: string) {
  if (spaceById(id)?.isDefault) return;
  batch(() => {
    const gone = new Set(
      chats()
        .filter((c) => c.spaceId === id)
        .map((c) => c.id),
    );
    spaces.update((all) => all.filter((s) => s.id !== id));
    sections.update((all) => all.filter((s) => s.spaceId !== id));
    chats.update((all) => all.filter((c) => !gone.has(c.id)));
    bots.update((all) => all.filter((b) => !gone.has(b.id)));
    runs.update((all) => all.filter((r) => !gone.has(r.chatId)));
    if (currentSpace() === id) currentSpace.set("personal");
  });
}

/** A new invite link to a space (a placeholder URL: no backend yet). */
export function createInvite(spaceId: string): string {
  spaces.update((all) => all.map((s) => (s.id === spaceId ? { ...s, openInvites: s.openInvites + 1 } : s)));
  return `https://pairidaeza.example/invite/${spaceId}-${nextId++}`;
}

export function cancelInvites(spaceId: string) {
  spaces.update((all) => all.map((s) => (s.id === spaceId ? { ...s, openInvites: 0 } : s)));
}

export function removeMember(spaceId: string, memberId: string) {
  spaces.update((all) => all.map((s) => (s.id === spaceId ? { ...s, members: s.members.filter((m) => m.id !== memberId) } : s)));
}

/** The user leaves a space: it leaves their sidebar. */
export function leaveSpace(spaceId: string) {
  batch(() => {
    const gone = new Set(
      chats()
        .filter((c) => c.spaceId === spaceId)
        .map((c) => c.id),
    );
    spaces.update((all) => all.filter((s) => s.id !== spaceId));
    chats.update((all) => all.filter((c) => !gone.has(c.id)));
    if (currentSpace() === spaceId) currentSpace.set("personal");
  });
}

// Group chats

/** Creates a group chat of 2–10 bots at the top of the list; returns its id. */
export function createGroup(name: string, botIds: string[]): string {
  const id = `g${nextId++}`;
  const members = [...new Set(botIds)].slice(0, GROUP_MEMBER_MAX);
  chats.update((all) => [{ id, botIds: members, title: name.trim(), preview: "", time: "Now", spaceId: currentSpaceId() }, ...all]);
  return id;
}

/** Adds a bot to a group chat, up to the limit. */
export function joinGroup(groupId: string, botId: string) {
  chats.update((all) =>
    all.map((c) =>
      c.id === groupId && !c.botIds.includes(botId) && c.botIds.length < GROUP_MEMBER_MAX ? { ...c, botIds: [...c.botIds, botId] } : c,
    ),
  );
}

// Skills

export const allSkills = () => skills();

const NEW_SKILL_TEMPLATE =
  "---\nname: new-skill\ndescription: What this skill does and when to use it.\n---\n\n# New skill\n\nSteps the bot follows.\n";

/** A SKILL.md frontmatter field, or "". */
function frontmatter(content: string, field: string) {
  return content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
}

/** Adds a skill from the template; returns its id. */
export function createSkill(): string {
  const id = `k${nextId++}`;
  skills.update((all) => [
    ...all,
    { id, name: "new-skill", description: frontmatter(NEW_SKILL_TEMPLATE, "description"), content: NEW_SKILL_TEMPLATE, source: "user" },
  ]);
  return id;
}

/** Saves a user skill's SKILL.md; its name and description come from the frontmatter. */
export function saveSkill(id: string, content: string) {
  skills.update((all) =>
    all.map((k) =>
      k.id === id && k.source === "user"
        ? { ...k, content, name: frontmatter(content, "name") || k.name, description: frontmatter(content, "description") }
        : k,
    ),
  );
}

export function deleteSkill(id: string) {
  skills.update((all) => all.filter((k) => k.id !== id || k.source !== "user"));
}

// Artifacts

/** Newest first (tracked where read). */
export const allArtifacts = () => [...artifacts()].sort((a, b) => b.createdAt - a.createdAt);
export const artifactById = (id: string) => artifacts().find((a) => a.id === id);
export function deleteArtifact(id: string) {
  artifacts.update((all) => all.filter((a) => a.id !== id));
}

// Account

export const allOrganizations = () => organizations();
export const activeOrganization = () => activeOrganizationId();
export const switchOrganization = (id: string) => activeOrganizationId.set(id);
export function renameOrganization(id: string, name: string) {
  organizations.update((all) => all.map((o) => (o.id === id ? { ...o, name: name.trim() } : o)));
}
/** Deletes an organization other than the last; the active one moves to the first left. */
export function deleteOrganization(id: string) {
  if (organizations().length < 2) return;
  organizations.update((all) => all.filter((o) => o.id !== id));
  if (activeOrganizationId() === id) activeOrganizationId.set(organizations()[0].id);
}

/** The user's invite link: a friend who signs up with it gets a longer trial (placeholder URL). */
export const referral = { url: "https://pairidaeza.example/sign-up?ref=ALEX42", trialWeeks: 2 };
export const mobileAppUrls = {
  ios: "https://apps.apple.com/app/pairidaeza/id0000000000",
  android: "https://play.google.com/store/apps/details?id=com.example.pairidaeza",
};
export const docsUrl = "https://pairidaeza.example/docs";

export const isSignedIn = () => signedIn();
export const signOut = () => signedIn.set(false);
export const signIn = () => signedIn.set(true);

export function renameSection(id: string, name: string) {
  sections.update((all) => all.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
}

/** Removes a section; its chats return to Chats. */
export function deleteSection(id: string) {
  batch(() => {
    sections.update((all) => all.filter((s) => s.id !== id));
    chats.update((all) => all.map((c) => (c.sectionId === id ? { ...c, sectionId: null } : c)));
  });
}

/** Empties a chat's transcript; the bot and its settings stay. */
export function clearHistory(id: string) {
  messages.update((all) => ({ ...all, [id]: [] }));
  patchChat(id, { preview: "" });
}

/** Deletes a chat; a bot's own chat takes the bot with it. */
export function deleteChat(id: string) {
  batch(() => {
    chats.update((all) => all.filter((c) => c.id !== id));
    bots.update((all) => all.filter((b) => b.id !== id));
    runs.update((all) => all.filter((r) => r.chatId !== id));
  });
}

/** One chat, or undefined (tracked where read). */
export const chatById = (id: string) => chats().find((chat) => chat.id === id);

/** One bot, or undefined (tracked where read). */
export const botById = (id: string) => bots().find((b) => b.id === id);

/** A chat's bots, in the chat's order (tracked where read). */
export const botsOfChat = (chatId: string) =>
  (chatById(chatId)?.botIds ?? []).map((id) => botById(id)).filter((b): b is Bot => b !== undefined);

/** A chat's transcript, oldest first (tracked where read). */
export const messagesFor = (chatId: string) => messages()[chatId] ?? [];

/** A bot's routines (tracked where read). */
export const routinesOf = (botId: string) => routines().filter((r) => r.botId === botId);

/** One routine, or undefined (tracked where read). */
export const routineById = (id: string) => routines().find((r) => r.id === id);

/** A bot's pages (tracked where read). */
export const pagesOf = (botId: string) => pages().filter((p) => p.botId === botId);

/** Every bot (tracked where read). */
export const allBots = () => bots();

/** Every page (tracked where read). */
export const allPages = () => pages();

/** The account's approval mode (tracked where read). */
export const currentApprovalMode = () => approvalMode();

export function setApprovalMode(mode: ApprovalMode) {
  approvalMode.set(mode);
}

/** Creates a bot and its chat at the top of the list; returns the chat's id. */
export function createBot(name: string, color: string): string {
  const id = `b${nextId++}`;
  batch(() => {
    bots.update((all) => [...all, bot(id, name.trim(), color, "")]);
    chats.update((all) => [{ id, botIds: [id], title: name.trim(), preview: "New bot", time: "Now", spaceId: currentSpaceId() }, ...all]);
    messages.update((all) => ({
      ...all,
      [id]: [{ id: `m${nextId++}`, kind: "bot", botId: id, markdown: `hi, I'm ${name.trim()}. tell me what you'd like me to take on.` }],
    }));
  });
  return id;
}

/** Changes a bot's settings; a renamed bot renames its own chat too. */
export function updateBot(id: string, patch: Partial<Omit<Bot, "id">>) {
  batch(() => {
    bots.update((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (patch.name) chats.update((all) => all.map((c) => (c.id === id ? { ...c, title: patch.name as string } : c)));
  });
}

/** Changes a routine. */
export function updateRoutine(id: string, patch: Partial<Omit<Routine, "id" | "botId">>) {
  routines.update((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

/** Adds a paused routine to a bot; returns its id. */
export function addRoutine(botId: string): string {
  const id = `routine-${nextId++}`;
  routines.update((all) => [
    ...all,
    { id, botId, name: "New routine", instruction: "", schedule: "Weekdays at 9:00 AM", active: false, runs: [] },
  ]);
  return id;
}

/** Removes a routine. */
export function removeRoutine(id: string) {
  routines.update((all) => all.filter((r) => r.id !== id));
}

/** Runs a routine now: the run is logged and its bot reports in its chat. */
export function runRoutine(id: string) {
  const routine = routineById(id);
  if (!routine) return;
  routines.update((all) => all.map((r) => (r.id === id ? { ...r, runs: ["Just now", ...r.runs] } : r)));
  append(routine.botId, {
    id: `m${nextId++}`,
    kind: "bot",
    botId: routine.botId,
    markdown: `ran **${routine.name}**. results are in the thread notes.`,
  });
}

function append(chatId: string, message: Message) {
  messages.update((all) => ({ ...all, [chatId]: [...(all[chatId] ?? []), message] }));
}

/** Sends a message, quoting `reply` when given; a bot of the chat answers after a moment. A blank message sends nothing. */
export function sendMessage(chatId: string, text: string, reply?: Reply) {
  const trimmed = text.trim();
  const chat = chatById(chatId);
  if (!trimmed || !chat) return;
  append(chatId, { id: `m${nextId++}`, kind: "user", text: trimmed, reply });
  const botId = chat.botIds[0];
  setTimeout(
    () => append(chatId, { id: `m${nextId++}`, kind: "bot", botId, markdown: "on it. I'll report back here when it's done." }),
    600,
  );
}

/** Answers a pending card; answered cards stay as they are. An applied instructions card changes its bot's instructions (`instructions` when the user edited them first). */
export function answerAsk(chatId: string, messageId: string, answer: string, instructions?: string) {
  const card = (messagesFor(chatId) as Message[]).find((m) => m.id === messageId);
  if (card?.kind !== "ask" || card.answer !== undefined) return;
  batch(() => {
    messages.update((all) => ({ ...all, [chatId]: (all[chatId] ?? []).map((m) => (m.id === messageId ? { ...m, answer } : m)) }));
    if (card.variant === "instructions" && answer === "allow") updateBot(card.botId, { instructions: instructions ?? card.detail ?? "" });
  });
}

/** Adds one reaction to a message. */
export function reactToMessage(chatId: string, messageId: string, emoji: string) {
  messages.update((all) => ({
    ...all,
    [chatId]: (all[chatId] ?? []).map((m) =>
      m.id === messageId ? { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions?.[emoji] ?? 0) + 1 } } : m,
    ),
  }));
}

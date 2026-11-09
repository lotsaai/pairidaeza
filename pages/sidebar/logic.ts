// The sidebar's rules without any signals, so tests can run them directly: grouping, Activity sections and filters, drag and drop.
import type { Chat, Run, RunStatus, Section, Space } from "../../store";

/** Queued work this old counts as stuck. */
export const STUCK_AFTER_MS = 4 * 60 * 60 * 1000;

/** The line a working or stuck chat shows in place of its preview. */
export const WORK_LINE: Partial<Record<RunStatus, string>> = {
  queued: "Waiting in line…",
  running: "Working…",
  waiting_input: "Needs an answer",
  waiting_takeover: "Needs you",
  failed: "Error",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_input: "Needs input",
  waiting_takeover: "Needs takeover",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STATUS_FILTERS: RunStatus[] = ["running", "queued", "waiting_input", "waiting_takeover", "completed", "failed", "cancelled"];

export type Attention = "needs_attention" | "working" | "unread" | null;

/** A question or a forgotten queue wins over work; a failure only matters while its chat is unread. */
export function activityAttention(run: Pick<Run, "status" | "at">, unread = false, now = Date.now()): Attention {
  if (run.status === "waiting_input" || run.status === "waiting_takeover" || (run.status === "queued" && now - run.at >= STUCK_AFTER_MS)) {
    return "needs_attention";
  }
  if (run.status === "queued" || run.status === "running") return "working";
  if (!unread) return null;
  return run.status === "failed" ? "needs_attention" : "unread";
}

export interface ActivityFilters {
  query: string;
  status: RunStatus | "all";
  /** ISO dates (`2026-11-08`) as typed; one that is not a date filters nothing. */
  from: string;
  to: string;
}

export const emptyFilters = (): ActivityFilters => ({ query: "", status: "all", from: "", to: "" });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (iso: string) => (ISO_DAY.test(iso) ? Date.parse(`${iso}T00:00:00`) : Number.NaN);
const dayEnd = (iso: string) => (ISO_DAY.test(iso) ? Date.parse(`${iso}T23:59:59.999`) : Number.NaN);

/** The filters as they apply: trimmed text, and dates that are dates. */
export function appliedFilters(f: ActivityFilters): ActivityFilters {
  return {
    query: f.query.trim(),
    status: f.status,
    from: Number.isNaN(dayStart(f.from)) ? "" : f.from,
    to: Number.isNaN(dayEnd(f.to)) ? "" : f.to,
  };
}

/** How many filters apply (the argument is `appliedFilters`). */
export const filterCount = (f: ActivityFilters) => [f.query !== "", f.status !== "all", f.from !== "", f.to !== ""].filter(Boolean).length;

/** `haystack` is the lowercase text a search looks in. */
export function runMatches(run: Pick<Run, "status" | "at">, haystack: string, f: ActivityFilters): boolean {
  if (f.query && !haystack.includes(f.query.toLowerCase())) return false;
  if (f.status !== "all" && run.status !== f.status) return false;
  if (f.from && run.at < dayStart(f.from)) return false;
  if (f.to && run.at > dayEnd(f.to)) return false;
  return true;
}

export function clearFilter(f: ActivityFilters, field: "query" | "status" | "from" | "to"): ActivityFilters {
  return { ...f, [field]: field === "status" ? "all" : "" };
}

export interface SidebarGroup {
  /** Folds and keys the header; includes the space once there are several. */
  key: string;
  kind: "pinned" | "section" | "chats" | "empty";
  title: string;
  /** The section's name under the space's, with several spaces. */
  subtitle?: string;
  spaceId: string;
  spaceName: string;
  /** Several spaces: headers carry a lock or the users icon. */
  showLock: boolean;
  shared: boolean;
  /** The section, for a section's group; null otherwise. */
  sectionId: string | null;
  /** The first header of its space carries the space's actions. */
  firstOfSpace: boolean;
  chats: Chat[];
}

/** Per space: Pinned, each section (empty ones too, so chats can move in), then the rest; a space with none keeps one header. Search narrows chats. */
export function sidebarGroups(input: { spaces: Space[]; chats: Chat[]; sections: Section[]; query: string }): SidebarGroup[] {
  const { spaces, query } = input;
  const several = spaces.length > 1;
  return spaces.flatMap((space) => {
    const chats = input.chats.filter((c) => c.spaceId === space.id && (!query || `${c.title} ${c.preview}`.toLowerCase().includes(query)));
    const sections = input.sections.filter((s) => s.spaceId === space.id);
    const known = new Set(sections.map((s) => s.id));
    const base = { spaceId: space.id, spaceName: space.name, showLock: several, shared: space.members.length > 1 };
    const header = (key: string, title: string) => ({
      key: several ? `space:${space.id}:${key}` : key,
      title: several ? space.name : title,
      subtitle: several ? title : undefined,
    });
    const groups: Omit<SidebarGroup, "firstOfSpace">[] = [
      { ...base, ...header("pinned", "Pinned"), kind: "pinned", sectionId: null, chats: chats.filter((c) => c.pinned) },
      ...sections.map((s) => ({
        ...base,
        ...header(`section:${s.id}`, s.name),
        kind: "section" as const,
        sectionId: s.id,
        chats: chats.filter((c) => !c.pinned && c.sectionId === s.id),
      })),
      {
        ...base,
        ...header("chats", "Chats"),
        kind: "chats",
        sectionId: null,
        chats: chats.filter((c) => !c.pinned && !(c.sectionId && known.has(c.sectionId))),
      },
    ];
    const shown = groups.filter((g) => g.chats.length > 0 || (g.kind === "section" && !query));
    if (shown.length === 0) {
      if (query) return [];
      return [
        {
          ...base,
          key: `space:${space.id}:empty`,
          kind: "empty" as const,
          title: space.name,
          sectionId: null,
          firstOfSpace: true,
          chats: [],
        },
      ];
    }
    return shown.map((g, i) => ({ ...g, firstOfSpace: i === 0 }));
  });
}

/** What the dragged row is: a single-bot chat, its place in the list as shown. */
export interface DropSource {
  id: string;
  botId: string;
  spaceId: string;
  pinned: boolean;
  /** The section it shows under; null for Chats. */
  sectionId: string | null;
}

export type DropTarget =
  | { kind: "bot"; id: string; spaceId: string; pinned: boolean; sectionId: string | null }
  | { kind: "group"; id: string; spaceId: string; memberIds: readonly string[] }
  | { kind: "section"; spaceId: string; sectionId: string | null };

export type DropAction =
  | { action: "reorder"; targetId: string }
  | { action: "move"; sectionId: string | null }
  | { action: "join"; groupId: string };

/** What dropping a bot on a row does: reorder among siblings, move to another section, join a group chat; null when refused. Pinned rows only reorder among pinned. */
export function resolveDrop(dragged: DropSource, target: DropTarget, groupMax: number): DropAction | null {
  if (target.spaceId !== dragged.spaceId) return null;
  switch (target.kind) {
    case "bot":
      if (target.id === dragged.id || target.pinned !== dragged.pinned) return null;
      if (dragged.pinned || target.sectionId === dragged.sectionId) return { action: "reorder", targetId: target.id };
      return { action: "move", sectionId: target.sectionId };
    case "section":
      if (dragged.pinned || target.sectionId === dragged.sectionId) return null;
      return { action: "move", sectionId: target.sectionId };
    case "group":
      if (target.memberIds.includes(dragged.botId) || target.memberIds.length >= groupMax) return null;
      return { action: "join", groupId: target.id };
  }
}

/** The row under the pointer: it started at the middle of row `from` and moved `dy` points; `heights` are the rows', in order. */
export function rowAt(heights: number[], from: number, dy: number): number {
  let i = from;
  let y = heights[i] / 2 + dy;
  while (y < 0 && i > 0) y += heights[--i];
  while (i < heights.length - 1 && y >= heights[i]) y -= heights[i++];
  return i;
}

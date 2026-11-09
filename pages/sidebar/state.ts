// What the sidebar remembers while it is on screen: its modes, search, folds and the drag in progress.
import { signal } from "nsh";
import { openChat, persisted } from "../../nav";
import { chatById, setCurrentSpace } from "../../store";
import { type ActivityFilters, emptyFilters } from "./logic";

/** Activity replaces the chat list while on. */
export const activityMode = signal(false);
/** The search field is open (Activity also shows it while filters apply). */
export const searchOpen = signal(false);
/** The chat search text. */
export const query = signal("");
/** Activity's search text, status and dates. */
export const activityFilters = signal<ActivityFilters>(emptyFilters());
/** The filter fields under the search field. */
export const filtersExpanded = signal(false);

/** Group keys folded against their default (open, unless a header says otherwise); kept across launches. */
export const folds = persisted("pairidaeza.sidebarFolds", [] as string[]);
export const isOpen = (key: string, defaultOpen = true) => defaultOpen !== folds().includes(key);
export function toggle(key: string) {
  folds.update((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
}

/** The bot row being dragged, and the row or header it would land on. */
export const draggedId = signal<string | null>(null);
export const dropKey = signal<string | null>(null);
/** The chat row holding the keyboard focus. */
export const focusedRowId = signal<string | null>(null);

/** Opens a chat in its space, which becomes the current one. */
export function openSpaceChat(id: string) {
  const chat = chatById(id);
  if (chat) setCurrentSpace(chat.spaceId);
  openChat(id);
}

// Navigation and surface state: the phone's stack, the selected chat, which overlays are open, and the sidebar's saved preferences.
import { effect, type Signal, signal, Storage, windowSize } from "nsh";
import { createNavStack } from "nsh/base";
import { markOpened } from "./store";

export type Route =
 | { name: "chats" }
 | { name: "chat"; id: string }
 | { name: "bot"; id: string }
 | { name: "new-group" }
 | { name: "artifacts" };

export type PanelTab = "settings" | "routines" | "pages" | "computer";

export const nav = createNavStack<Route>([{ name: "chats" }]);

/** The chat shown beside the sidebar on wide windows. */
export const selectedChatId = signal("launch");

/** Wide windows show the sidebar and the chat side by side. */
export const wide = () => windowSize().width >= 768;

/** Windows wide enough for the bot panel beside the chat; narrower ones show it as a sheet. */
export const roomy = () => windowSize().width >= 1180;

/** What the main pane beside the sidebar shows on wide windows. */
export const mainView = signal<"chat" | "artifacts">("chat");

/** Opens a chat: selects it beside the sidebar, or pushes it on a phone. Opening it reads it. */
export function openChat(id: string) {
 selectedChatId.set(id);
 mainView.set("chat");
 markOpened(id);
 if (!wide()) nav.push({ name: "chat", id });
}

/** The Artifacts page: in the main pane on wide windows, pushed on a phone. */
export function openArtifacts() {
 if (wide()) mainView.set("artifacts");
 else nav.push({ name: "artifacts" });
}

/** A signal kept in the app's storage across launches (JSON); writes start once the saved value has loaded. */
export function persisted<T>(key: string, initial: T): Signal<T> {
 const value = signal<T>(initial);
 const loaded = signal(false);
 void Storage.getItem(key).then((saved) => {
  if (saved !== null) value.set(JSON.parse(saved) as T);
  loaded.set(true);
 });
 effect(() => {
  const v = value();
  if (loaded()) void Storage.setItem(key, JSON.stringify(v));
 });
 return value;
}

export type SidebarDensity = "comfortable" | "compact";
/** Row size in the sidebar: comfortable shows previews and times, compact shows a status line only. */
export const sidebarDensity = persisted<SidebarDensity>("pairidaeza.sidebarDensity", "comfortable");
/** The sidebar's width on wide windows, in points (240–480, 316 by default). */
export const sidebarWidth = persisted("pairidaeza.sidebarWidth", 316);
/** The sidebar collapsed to the icon rail on wide windows. */
export const sidebarCollapsed = persisted("pairidaeza.sidebarCollapsed", false);

/** The bot whose details show in the panel, or null while it is closed. */
export const panelBotId = signal<string | null>(null);
export const panelTab = signal<PanelTab>("settings");
/** The routine open in the panel's Routines tab, or null for the list. */
export const panelRoutineId = signal<string | null>(null);
/** The page open in the panel's Pages tab, or null for the list. */
export const panelPageId = signal<string | null>(null);

/** Shows a bot's details: beside the chat on wide windows, as a page on phones. */
export function openBotDetails(botId: string, tab: PanelTab = "settings") {
 panelTab.set(tab);
 panelRoutineId.set(null);
 panelPageId.set(null);
 panelBotId.set(botId);
 if (!wide()) nav.push({ name: "bot", id: botId });
}

export type SettingsSection =
 | "general"
 | "organization"
 | "models"
 | "voice"
 | "approvals"
 | "vault"
 | "memory"
 | "usage"
 | "computer"
 | "updates";
export type SettingsRoute = { name: "root" } | { name: SettingsSection };

/** Settings takes over the window with its own stack: on phones a list of sections, each pushed as a page;
 * on wide windows the sections beside the one shown, which is the stack's top (General at the root). */
export const settingsNav = createNavStack<SettingsRoute>([{ name: "root" }]);
export const settingsOpen = signal(false);

/** Opens settings at its list (General beside it on wide windows), or straight at one section. */
export function openSettings(section?: SettingsSection) {
 settingsNav.setRoutes(section ? [{ name: "root" }, { name: section }] : [{ name: "root" }]);
 settingsOpen.set(true);
}

export const searchOpen = signal(false);
export const newBotOpen = signal(false);
/** The new group chat form: in the bot panel's place on wide windows, a page on phones. */
export const newGroupOpen = signal(false);
export function openNewGroup() {
 panelBotId.set(null);
 newGroupOpen.set(true);
 if (!wide()) nav.push({ name: "new-group" });
}
export const newSpaceOpen = signal(false);
/** The space whose settings are open, or null. */
export const spaceSettingsId = signal<string | null>(null);
export const skillsOpen = signal(false);
export const integrationsOpen = signal(false);
export const inviteOpen = signal(false);
export const mobileAppOpen = signal(false);

/** The section being named: a new one (`id` null, `chatId` moved into it) or a rename; null while closed. */
export const sectionDialog = signal<{ id: string | null; chatId?: string } | null>(null);
/** The name typed in that dialog. */
export const sectionName = signal("");

export function nameSection(edit: { id: string | null; chatId?: string }, name = "") {
 sectionName.set(name);
 sectionDialog.set(edit);
}

// Sidebar slice (ChatList): the rail, its width and the live width while the edge is dragged.
export const SIDEBAR_RAIL_WIDTH = 72;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;
/** A drag below this width snaps the sidebar to the rail. */
export const SIDEBAR_SNAP_WIDTH = 160;

/** The widest the sidebar gets: 480, or less to leave the chat 320. */
export const sidebarMaxWidth = () => Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, windowSize().width - 320));
export const clampSidebarWidth = (width: number) => Math.round(Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, width)));

/** The width the edge is dragged to right now, or null while it is not dragged. */
export const sidebarDragWidth = signal<number | null>(null);

/** The sidebar shows as the 72pt rail: saved collapsed, or dragged below the snap width. */
export const sidebarRail = () => wide() && (sidebarDragWidth() !== null ? sidebarDragWidth()! < SIDEBAR_SNAP_WIDTH : sidebarCollapsed());

/** The sidebar's width on wide windows, drag included. */
export const sidebarShownWidth = () => {
 if (sidebarRail()) return SIDEBAR_RAIL_WIDTH;
 return clampSidebarWidth(sidebarDragWidth() ?? sidebarWidth());
};

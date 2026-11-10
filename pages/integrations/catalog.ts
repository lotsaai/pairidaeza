import { batch } from "nsh";
import { apiSignal } from "../../api";

export const PLUGIN_CATEGORIES = [
  "productivity",
  "communication",
  "sales",
  "marketing",
  "finance",
  "people",
  "design",
  "code",
  "data",
  "ops",
] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

const categoryLabels: Record<PluginCategory, string> = {
  productivity: "Productivity",
  communication: "Communication",
  sales: "Sales & CRM",
  marketing: "Marketing",
  finance: "Finance",
  people: "Recruiting & HR",
  design: "Design",
  code: "Developer",
  data: "Data",
  ops: "Security & Ops",
};
export const categoryLabel = (name: string) => categoryLabels[name as PluginCategory] ?? name;

/** An app a bot connects to: its accounts and tools. */
export type App = { id: string; name: string; slug: string; tools: string[] };

export const apps = apiSignal<App[]>("integrations", "apps", []);

/** The apps shown first, as a grid with no heading. */
export const featuredIds = ["gmail", "google-calendar", "google-drive", "slack", "notion"];

export const appById = (id: string) => apps().find((a) => a.id === id);

/** "GMAIL_SEND_EMAIL" under Gmail reads as "Send email": the app is already the page title. */
export function toolLabel(name: string, app: App) {
  const prefix = `${app.slug}_`;
  const bare = name.toLowerCase().startsWith(prefix.toLowerCase()) ? name.slice(prefix.length) : name;
  const spaced = bare.replace(/_/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type Skill = { name: string; description: string; content?: string };
/** A plugin from the marketplace (or a repo previewed from GitHub): an MCP connector and/or skills. */
export type Plugin = {
  name: string;
  displayName: string;
  description: string;
  category: PluginCategory | null;
  /** Where it installs from; also its identity. */
  source: string;
  skills: Skill[];
  servers: { name: string; endpoint?: string }[];
};

const previewFixture = apiSignal<Plugin | null>("integrations", "previewFixture", null);

export const plugins = apiSignal<Plugin[]>("integrations", "plugins", []);

/** Brands people look for first, in order. */
const RECOMMENDED = [
  "github",
  "stripe",
  "vercel",
  "figma",
  "hubspot",
  "salesforce",
  "sentry",
  "supabase",
  "calcom",
  "zoom",
  "datadog",
  "attio",
  "intercom",
  "cloudflare",
  "neon",
  "docusign",
];
export const recommendedPlugins = () =>
  plugins()
    .filter((p) => RECOMMENDED.includes(p.name))
    .sort((a, b) => RECOMMENDED.indexOf(a.name) - RECOMMENDED.indexOf(b.name))
    .slice(0, 6);

/** Remote MCP services offered as one-step sources. A preset with a URL always connects there. */
export type Preset = { id: string; name: string; url?: string; urlPlaceholder?: string };
export const presets = apiSignal<Preset[]>("integrations", "presets", []);

/** What a search of the public MCP catalog finds. */
const mcpDirectory = apiSignal<{ name: string; endpoint: string }[]>("integrations", "mcpDirectory", []);
export const searchMcp = (query: string) => {
  const needle = query.trim().toLowerCase();
  return mcpDirectory().filter((r) => r.name.toLowerCase().includes(needle));
};

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Every query word starts a word of the text, or the text with its separators removed. */
export function matchesWordPrefixes(text: string, query: string) {
  const have = words(text);
  const compact = have.join("");
  return words(query).every((term) => compact.startsWith(term) || have.some((w) => w.startsWith(term)));
}

export const matchesPlugin = (p: Plugin, query: string) =>
  matchesWordPrefixes(
    [p.name, p.displayName, p.description, p.category ?? "", p.category ? categoryLabel(p.category) : ""].join(" "),
    query,
  );

/** Plugins the user previewed from a GitHub URL. */
const previews = apiSignal<Plugin[]>("integrations", "previews", []);
export const pluginBySource = (source: string) => plugins().find((p) => p.source === source) ?? previews().find((p) => p.source === source);

/** Previews the plugin at a repo: the marketplace's own plugins and its fixture repo resolve; any other repo cannot be reached. */
export function previewGithub(url: string): boolean {
  const source = url.trim().replace(/\/$/, "");
  if (pluginBySource(source)) return true;
  const fixture = previewFixture();
  if (!fixture || source !== fixture.source) return false;
  previews.update((all) => [...all, fixture]);
  return true;
}

// Connected apps and their accounts.
const connectedIds = apiSignal<string[]>("integrations", "connectedIds", []);
const accounts = apiSignal<Record<string, string[]>>("integrations", "accounts", {});
export const isConnected = (id: string) => connectedIds().includes(id);
export const accountsOf = (id: string) => accounts()[id] ?? [];

export function connectApp(id: string) {
  const app = appById(id);
  if (!app || isConnected(id)) return;
  batch(() => {
    connectedIds.update((all) => [...all, id]);
    accounts.update((all) => ({ ...all, [id]: [app.name] }));
  });
}

export function uninstallApp(id: string) {
  batch(() => {
    connectedIds.update((all) => all.filter((x) => x !== id));
    accounts.update((all) => ({ ...all, [id]: [] }));
  });
}

export function addAccount(id: string) {
  const app = appById(id);
  if (app) accounts.update((all) => ({ ...all, [id]: [...(all[id] ?? []), app.name] }));
}

export function renameAccount(id: string, index: number, label: string) {
  accounts.update((all) => ({ ...all, [id]: (all[id] ?? []).map((l, i) => (i === index ? label : l)) }));
}

/** Removing the last account uninstalls the app. */
export function removeAccount(id: string, index: number) {
  const left = accountsOf(id).filter((_, i) => i !== index);
  if (left.length === 0) return uninstallApp(id);
  accounts.update((all) => ({ ...all, [id]: left }));
}

// Installed plugins: which parts they added, and which of their servers signed in.
export type PluginPart = "connector" | "skills";
type Install = { parts: PluginPart[]; signedIn: string[] };
const installs = apiSignal<Record<string, Install>>("integrations", "installs", {});
export const installOf = (source: string) => installs()[source];

export function setPart(source: string, part: PluginPart, on: boolean) {
  installs.update((all) => {
    const now = all[source] ?? { parts: [], signedIn: [] };
    const parts = on ? [...now.parts.filter((p) => p !== part), part] : now.parts.filter((p) => p !== part);
    const { [source]: _gone, ...rest } = all;
    return parts.length === 0 ? rest : { ...all, [source]: { parts, signedIn: parts.includes("connector") ? now.signedIn : [] } };
  });
}

/** Signing in to a server completes at once: the sign-in page is the server's. */
export function signIn(source: string, server: string) {
  installs.update((all) => {
    const now = all[source];
    return now ? { ...all, [source]: { ...now, signedIn: [...now.signedIn.filter((s) => s !== server), server] } } : all;
  });
}

const connectorInstalls = () =>
  Object.entries(installs()).flatMap(([source, install]) => {
    const plugin = pluginBySource(source);
    return plugin && install.parts.includes("connector") ? [{ plugin, install }] : [];
  });
export const connectorPlugins = () => connectorInstalls().map((c) => c.plugin);
export const needsSignIn = (plugin: Plugin) => {
  const install = installOf(plugin.source);
  return plugin.servers.some((s) => !install?.signedIn.includes(s.name));
};
const readyInstalls = () => connectorInstalls().filter(({ plugin }) => plugin.servers.length > 0 && !needsSignIn(plugin));

// Servers a bot can use in a chat.
const assigned = apiSignal<string[]>("integrations", "assigned", []);
export const isAssigned = (botId: string, source: string, server: string) => assigned().includes(`${botId}|${source}|${server}`);
export const assign = (botId: string, source: string, server: string) => assigned.update((all) => [...all, `${botId}|${source}|${server}`]);

// MCP servers added by URL, and custom tool sources.
export type McpServer = { id: string; name: string; endpoint: string };
export type SourceKind = "mcp" | "api" | "graphql";
export type Source = { id: string; name: string; kind: SourceKind; url: string };
export const servers = apiSignal<McpServer[]>("integrations", "servers", []);
export const sources = apiSignal<Source[]>("integrations", "sources", []);

const nextId = (prefix: string, items: { id: string }[]) => {
  let n = 1;
  while (items.some((item) => item.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export function addServer(name: string, endpoint: string) {
  if (!servers().some((s) => s.endpoint === endpoint)) servers.update((all) => [...all, { id: nextId("server", all), name, endpoint }]);
}
export const addSource = (name: string, kind: SourceKind, url: string) =>
  sources.update((all) => [...all, { id: nextId("source", all), name, kind, url }]);
export const removeSource = (id: string) => sources.update((all) => all.filter((s) => s.id !== id));

/** Everything listed under "Your apps". */
export const appCount = () => connectedIds().length + servers().length + sources().length + connectorInstalls().length;
/** What the footer and the count button report: apps and sources in use, plugins once signed in. */
export const connectedCount = () => connectedIds().length + servers().length + sources().length + readyInstalls().length;
/** The first few connected apps, for the count button's marks. */
export const connectedMarks = () =>
  [...connectedIds().map((id) => appById(id)?.name ?? id), ...readyInstalls().map((c) => c.plugin.displayName)].slice(0, 4);

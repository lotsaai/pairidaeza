import { batch, platform, type Signal, signal, Storage } from "nsh";

type User = { id: string; name: string; email: string };
type Document = { revision: number; state: Record<string, unknown> };
type Namespace = { revision: number; fields: Map<string, (value: unknown) => void>; pending: Record<string, unknown>; busy: boolean };

const namespaces = new Map<string, Namespace>();
const tokenKey = "pairidaeza.mockSession";
const baseUrl = platform.os === "web" ? "" : process.env.PAIRIDAEZA_API_URL || "http://127.0.0.1:17810";
let token: string | null = null;
export const sessionUser = signal<User | null>(null);
export const bootState = signal<"loading" | "ready" | "error">("loading");
export const apiError = signal("");
export const saving = signal(false);

function namespaceFor(name: string): Namespace {
  let value = namespaces.get(name);
  if (!value) {
    value = { revision: 0, fields: new Map(), pending: {}, busy: false };
    namespaces.set(name, value);
  }
  return value;
}

async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function document(value: unknown): Document {
  if (!object(value) || typeof value.revision !== "number" || !object(value.state)) throw new Error("Invalid workspace response");
  return { revision: value.revision, state: value.state };
}

function user(value: unknown): User {
  if (!object(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.email !== "string")
    throw new Error("Invalid session response");
  return { id: value.id, name: value.name, email: value.email };
}

async function bootstrap(): Promise<void> {
  const response = await request("/api/mock/bootstrap");
  if (!response.ok) throw new Error(`Loading workspace failed (HTTP ${response.status})`);
  const data: unknown = await response.json();
  if (!object(data) || !object(data.documents)) throw new Error("Invalid bootstrap response");
  const docs = data.documents;
  const loaded = new Map<string, Document>();
  for (const [name, ns] of namespaces) {
    const doc = document(docs[name]);
    for (const key of ns.fields.keys()) if (!(key in doc.state)) throw new Error(`Missing ${name}.${key} in bootstrap`);
    loaded.set(name, doc);
  }
  const currentUser = user(data.user);
  batch(() => {
    for (const [name, ns] of namespaces) {
      const doc = loaded.get(name)!;
      ns.revision = doc.revision;
      for (const [key, apply] of ns.fields) apply(doc.state[key]);
    }
    sessionUser.set(currentUser);
  });
}

async function createSession(): Promise<void> {
  const response = await request("/api/mock/session", "POST");
  if (!response.ok) throw new Error(`Sign in failed (HTTP ${response.status})`);
  const data: unknown = await response.json();
  if (!object(data) || typeof data.token !== "string") throw new Error("Invalid session response");
  user(data.user);
  token = data.token;
  await Storage.setItem(tokenKey, token);
}

export async function loadApi(): Promise<void> {
  bootState.set("loading");
  apiError.set("");
  try {
    const saved = await Storage.getItem(tokenKey);
    if (saved === "signed-out") {
      sessionUser.set(null);
      bootState.set("ready");
      return;
    }
    token = saved;
    if (!token) await createSession();
    await bootstrap();
    bootState.set("ready");
  } catch (error) {
    apiError.set(String(error));
    bootState.set("error");
  }
}

export async function signInSession(): Promise<void> {
  bootState.set("loading");
  try {
    await createSession();
    await bootstrap();
    apiError.set("");
    bootState.set("ready");
  } catch (error) {
    apiError.set(String(error));
    bootState.set("error");
  }
}

export async function signOutSession(): Promise<void> {
  if (saving()) {
    apiError.set("Changes are still waiting to be saved. Retry saving before signing out.");
    return;
  }
  try {
    const response = await request("/api/mock/session", "DELETE");
    if (!response.ok) throw new Error(`Sign out failed (HTTP ${response.status})`);
    token = null;
    await Storage.setItem(tokenKey, "signed-out");
    sessionUser.set(null);
  } catch (error) {
    apiError.set(String(error));
  }
}

function updateSaving() {
  saving.set([...namespaces.values()].some((ns) => ns.busy || Object.keys(ns.pending).length > 0));
}

async function flush(name: string, ns: Namespace): Promise<void> {
  if (ns.busy || !token || !Object.keys(ns.pending).length) return;
  ns.busy = true;
  const changes = ns.pending;
  ns.pending = {};
  updateSaving();
  try {
    const response = await request(`/api/mock/state/${encodeURIComponent(name)}`, "PATCH", { revision: ns.revision, changes });
    if (response.status === 409) {
      ns.revision = document(await response.json()).revision;
      ns.pending = { ...changes, ...ns.pending };
      ns.busy = false;
      void flush(name, ns);
      return;
    }
    if (!response.ok) throw new Error(`Saving ${name} failed (HTTP ${response.status})`);
    const doc = document(await response.json());
    ns.revision = doc.revision;
    batch(() => {
      for (const [key, apply] of ns.fields) if (!(key in ns.pending) && key in doc.state) apply(doc.state[key]);
    });
  } catch (error) {
    ns.pending = { ...changes, ...ns.pending };
    apiError.set(String(error));
    ns.busy = false;
    updateSaving();
    return;
  }
  ns.busy = false;
  updateSaving();
  if (Object.keys(ns.pending).length) void flush(name, ns);
}

export async function retrySaving(): Promise<void> {
  apiError.set("");
  try {
    const response = await request("/api/mock/bootstrap");
    if (!response.ok) throw new Error(`Retry failed (HTTP ${response.status})`);
    const data: unknown = await response.json();
    if (!object(data) || !object(data.documents)) throw new Error("Invalid bootstrap response");
    for (const [name, ns] of namespaces) ns.revision = document(data.documents[name]).revision;
    for (const [name, ns] of namespaces) void flush(name, ns);
  } catch (error) {
    apiError.set(String(error));
  }
}

export function apiSignal<T>(namespace: string, key: string, initial: T): Signal<T> {
  const value = signal(initial);
  const ns = namespaceFor(namespace);
  ns.fields.set(key, (next) => value.set(next as T));
  const result: Signal<T> = () => value();
  result.set = (next) => {
    value.set(next);
    ns.pending[key] = next;
    updateSaving();
    void flush(namespace, ns);
  };
  result.update = (fn) => result.set(fn(value()));
  return result;
}

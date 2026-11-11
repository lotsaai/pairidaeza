import { openUrl, platform, signal, Storage } from "nsh";
import { NativeAuth } from "pairidaeza/native";

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  picture?: string;
  username?: string;
  givenName?: string;
  familyName?: string;
  locale?: string;
};

type Tokens = { accessToken: string; refreshToken: string | null; expiresAt: number | null };
const tokenKey = "pairidaeza.tokens";
const browserEnvironment: unknown = globalThis;
const browserOrigin =
  object(browserEnvironment) && typeof browserEnvironment.origin === "string" && browserEnvironment.origin !== "null"
    ? browserEnvironment.origin
    : undefined;
const baseUrl =
  platform.os === "web"
    ? browserOrigin || process.env.PAIRIDAEZA_WEB_URL || ""
    : process.env.PAIRIDAEZA_API_URL || "http://127.0.0.1:17810";
let tokens: Tokens | null = null;
let transaction: string | null = null;
let attempt = 0;
let refreshInFlight: Promise<boolean> | null = null;
let storageWrites: Promise<void> = Promise.resolve();

export const sessionUser = signal<User | null>(null);
export const signInState = signal<"idle" | "starting" | "waiting" | "finishing">("idle");
export const signInError = signal("");

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTokens(text: string): Tokens {
  const value: unknown = JSON.parse(text);
  if (
    !object(value) ||
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    !(value.refreshToken === null || typeof value.refreshToken === "string") ||
    !(value.expiresAt === null || typeof value.expiresAt === "number")
  )
    throw new Error("Invalid token response");
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt };
}

export function sessionIdentity(value: unknown): User {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.email !== "string" ||
    !value.email ||
    typeof value.emailVerified !== "boolean"
  )
    throw new Error("Invalid session response");
  const user: User = { id: value.id, name: value.name, email: value.email, emailVerified: value.emailVerified };
  for (const key of ["picture", "username", "givenName", "familyName", "locale"] as const) {
    if (value[key] != null) {
      if (typeof value[key] !== "string") throw new Error("Invalid session response");
      user[key] = value[key] as string;
    }
  }
  return user;
}

async function saveTokens(next: Tokens, current: number): Promise<void> {
  const write = storageWrites.then(async () => {
    if (current !== attempt) return;
    await Storage.setItem(tokenKey, JSON.stringify(next));
    if (current !== attempt) await Storage.removeItem(tokenKey);
    else tokens = next;
  });
  storageWrites = write.catch(() => {});
  await write;
}

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = tokens?.refreshToken;
  if (!refreshToken) return false;
  const current = attempt;
  refreshInFlight = (async () => {
    const next = parseTokens(await NativeAuth.refresh(refreshToken));
    await saveTokens(next, current);
    return current === attempt;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function loadSessionToken(): Promise<boolean> {
  if (platform.os === "web") return true;
  const stored = await Storage.getItem(tokenKey);
  tokens = stored ? parseTokens(stored) : null;
  if (tokens?.expiresAt !== null && tokens?.expiresAt !== undefined && tokens.expiresAt * 1000 <= Date.now() + 30000) {
    return refreshTokens();
  }
  return tokens !== null;
}

export async function authenticatedRequest(path: string, method = "GET", body?: unknown): Promise<Response> {
  const send = () => {
    const headers: Record<string, string> = {};
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (platform.os === "web" && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") headers["X-Pairidaeza-Request"] = "1";
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const response = await send();
  if (platform.os !== "web" && response.status === 401 && (await refreshTokens())) return send();
  return response;
}

export function cancelSignIn(): void {
  attempt++;
  transaction = null;
  signInState.set("idle");
  signInError.set("");
}

export async function signInSession(): Promise<void> {
  if (signInState() !== "idle") return;
  const current = ++attempt;
  signInError.set("");
  signInState.set("starting");
  try {
    if (platform.os === "web") {
      const browser = globalThis as unknown as { top: { location: { assign(url: string): void } } };
      browser.top.location.assign("/auth/begin");
      return;
    }
    const result: unknown = JSON.parse(await NativeAuth.begin());
    if (!object(result) || typeof result.url !== "string" || typeof result.transaction !== "string")
      throw new Error("Invalid sign-in response");
    if (current !== attempt) return;
    transaction = result.transaction;
    signInState.set("waiting");
    if (!(await openUrl(result.url)).opened) throw new Error("Could not open the browser");
  } catch {
    if (current !== attempt) return;
    transaction = null;
    signInState.set("idle");
    signInError.set("Authentication failed. Try again.");
  }
}

export async function finishSignIn(url: string, onSignedIn: () => Promise<void>): Promise<void> {
  if (!transaction || signInState() !== "waiting") return;
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return;
  }
  if (link.protocol !== "ai.lotsa.pairidaeza:" || link.host !== "" || link.pathname !== "/auth" || link.hash) return;
  const current = attempt;
  const pending = transaction;
  transaction = null;
  signInState.set("finishing");
  try {
    const next = parseTokens(await NativeAuth.finish(pending, url));
    await saveTokens(next, current);
    if (current !== attempt) return;
    signInState.set("idle");
    await onSignedIn();
  } catch {
    if (current !== attempt) return;
    signInState.set("idle");
    signInError.set("Authentication failed. Try again.");
  }
}

export async function signOutSession(): Promise<void> {
  if (platform.os === "web") {
    const response = await authenticatedRequest("/auth/logout", "POST");
    if (!response.ok) throw new Error("Authentication failed. Try again.");
  } else {
    cancelSignIn();
    await storageWrites;
    await Storage.removeItem(tokenKey);
  }
  tokens = null;
  cancelSignIn();
  sessionUser.set(null);
}

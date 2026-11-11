import workspace from "./crates/pairidaezad/fixtures/workspace.json";
import models from "./crates/pairidaezad/fixtures/models.json";
import voice from "./crates/pairidaezad/fixtures/voice.json";
import memory from "./crates/pairidaezad/fixtures/memory.json";
import vault from "./crates/pairidaezad/fixtures/vault.json";
import usage from "./crates/pairidaezad/fixtures/usage.json";
import computer from "./crates/pairidaezad/fixtures/computer.json";
import approvals from "./crates/pairidaezad/fixtures/approvals.json";
import integrations from "./crates/pairidaezad/fixtures/integrations.json";
import templates from "./crates/pairidaezad/fixtures/templates.json";
import { open as openApp, type OpenOptions } from "nsh/test";

export async function fixtureData() {
  const fixtures = { workspace, models, voice, memory, vault, usage, computer, approvals, integrations, templates };
  const documents: Record<string, { revision: number; state: Record<string, unknown> }> = {};
  for (const [name, state] of Object.entries(fixtures)) {
    documents[name] = { revision: 0, state: JSON.parse(JSON.stringify(state)) };
  }
  return { user: { id: "u1", name: "Alex Rivera", email: "alex@example.com", emailVerified: true }, documents };
}

/** Start UI journeys with isolated fixture state. */
export async function fixtureApps() {
  const bootstrap = await fixtureData();
  const network: Exclude<OpenOptions["network"], "live" | null | undefined> = {
    "GET */api/data/bootstrap": () => ({ body: bootstrap }),
    "POST */auth/logout": { status: 204 },
  };
  for (const [name, document] of Object.entries(bootstrap.documents)) {
    network[`PATCH */api/data/documents/${encodeURIComponent(name)}`] = (request) => {
      const body = JSON.parse(request.body ?? "{}") as { revision: number; changes: Record<string, unknown> };
      if (body.revision !== document.revision) return { status: 409, body: document };
      document.state = { ...document.state, ...body.changes };
      document.revision++;
      return { body: document };
    };
  }
  return async (entry: string, options?: OpenOptions | null) => {
    const app = await openApp(entry, {
      ...options,
      storage: {
        ...options?.storage,
        "pairidaeza.tokens": JSON.stringify({ accessToken: "test-session", refreshToken: null, expiresAt: null }),
      },
      network,
    });
    await app.waitFor("role:button[Writer]");
    return app;
  };
}

export async function open(entry: string, options?: OpenOptions | null) {
  return (await fixtureApps())(entry, options);
}

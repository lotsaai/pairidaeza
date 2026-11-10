import { open as openApp, type OpenOptions } from "nsh/test";

/** Start each UI journey with isolated fixture state on the real development API. */
export async function open(entry: string, options?: OpenOptions | null) {
  const reset = await openApp("./api-reset-app.tsx", { network: "live" });
  await reset.waitFor("Mock API reset");
  const app = await openApp(entry, { ...options, network: "live" });
  await app.waitFor("role:button[Writer]");
  return app;
}

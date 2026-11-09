// Where Integrations is: its stack of views, shared by the header and the pages.
import { createNavStack } from "nsh/base";
import { integrationsOpen } from "../../nav";
import type { Preset, SourceKind } from "./catalog";

export type Route =
  | { name: "browse" }
  | { name: "manage" }
  | { name: "templates" }
  | { name: "template"; slug: string }
  | { name: "connector"; id: string }
  | { name: "plugin"; source: string }
  | { name: "github" }
  | { name: "source"; kind: SourceKind; preset?: Preset }
  /** Browse MCP servers, searching `query` once on open. */
  | { name: "mcp"; query?: string };

export const stack = createNavStack<Route>([{ name: "browse" }]);
export const go = (route: Route) => stack.push(route);
export const top = () => stack.routes()[stack.routes().length - 1];
/** Your apps, one step from browse. */
export const showManage = () => stack.setRoutes([{ name: "browse" }, { name: "manage" }]);
export const close = () => integrationsOpen.set(false);

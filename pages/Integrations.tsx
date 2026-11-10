// Integrations take over the window like Settings: apps, plugins and MCP servers to add, and what is connected.
// Wide windows: the view under a header. Phones: the views as pages of a stack, each with a way back.
import { effect, type JSX, Scroll, Text, untracked, View } from "nsh";
import { Button, Dialog, NavPage, NavStack } from "nsh/base";
import { AppMenu, Icon, IconButton, MenuDivider, MenuRow } from "../components/ui";
import { integrationsOpen, wide } from "../nav";
import { Browse, resetBrowse } from "./integrations/browse";
import { appById, appCount, connectedCount, connectedMarks } from "./integrations/catalog";
import { ConnectorDetail } from "./integrations/connector";
import { beginSource, GithubImport, McpBrowse, openMcpBrowse, SourceForm, sourceChoices } from "./integrations/forms";
import { Manage } from "./integrations/manage";
import { resetTemplates, TemplateDetail, Templates, templateBySlug } from "./integrations/templates";
import { PluginDetail } from "./integrations/plugin";
import { close, go, type Route, showManage, stack, top } from "./integrations/route";

const sourceTitle = { mcp: "MCP server", api: "OpenAPI", graphql: "GraphQL" } as const;

/** What the header says: the dialog's name, or the view's own when it is a step of adding. */
const titleOf = (route: Route) =>
  route.name === "manage"
    ? "Your apps"
    : route.name === "github"
      ? "From GitHub"
      : route.name === "source"
        ? (route.preset?.name ?? sourceTitle[route.kind])
        : route.name === "mcp"
          ? "Browse MCP servers"
          : route.name === "templates"
            ? "Bot templates"
            : route.name === "template"
              ? (templateBySlug(route.slug)?.name ?? "Bot template")
              : "Integrations";

/** The + menu: a plugin from GitHub, a custom connector, or the MCP catalog. */
function AddMenu() {
  return (
    <AppMenu
      align="end"
      trigger={
        <View role="button" accessibilityLabel="Add custom" class="size-9 items-center justify-center rounded-full hover:bg-accent">
          <Icon name="plus" size={18} tone="muted-foreground" />
        </View>
      }
    >
      <MenuRow icon="download" label="From GitHub" onSelect={() => go({ name: "github" })} />
      <MenuDivider />
      <Each of={sourceChoices()} key={(c) => c.label}>
        {(choice) => (
          <MenuRow
            icon={choice().kind === "mcp" ? "plug" : "file-text"}
            label={choice().label}
            onSelect={() => beginSource(choice().kind, choice().preset)}
          />
        )}
      </Each>
      <MenuDivider />
      <MenuRow icon="search" label="Browse MCP servers" onSelect={() => openMcpBrowse()} />
      <MenuRow icon="settings" label="Manage MCP servers" onSelect={showManage} />
    </AppMenu>
  );
}

/** The connected apps' first letters, overlapping, then how many are connected. */
function ConnectedButton() {
  return (
    <Button
      accessibilityLabel={`${connectedCount()} connected`}
      onPress={showManage}
      class="min-h-9 flex-row items-center gap-2.5 rounded-full px-2.5 hover:bg-accent"
    >
      <If when={wide()}>
        <View class="flex-row">
          <Each of={connectedMarks()} key={(name) => name}>
            {(name, index) => (
              <View
                class={`size-6 items-center justify-center rounded-lg border-2 border-background bg-muted ${index() > 0 ? "-ms-1.5" : ""}`}
              >
                <Text class="text-xs font-semibold text-foreground">{name().slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </Each>
        </View>
      </If>
      <Text class="text-sm text-muted-foreground">{connectedCount()} connected</Text>
      <Icon name="chevron-right" size={14} tone="muted-foreground" />
    </Button>
  );
}

function Header(props: { route: Route }) {
  return (
    <View
      class={
        wide()
          ? "flex-row items-center gap-3 border-b border-border px-8 pt-12 pb-5"
          : "h-14 flex-row items-center gap-2 border-b border-border px-3"
      }
    >
      <If when={props.route.name !== "browse"}>
        <IconButton icon="chevron-left" label="Back" onPress={() => stack.pop()} />
      </If>
      <Text role="header" class="min-w-0 flex-1 truncate text-xl font-medium text-foreground">
        {titleOf(props.route)}
      </Text>
      <If when={props.route.name === "browse"}>
        <Button
          accessibilityLabel="Templates"
          onPress={() => go({ name: "templates" })}
          class="min-h-9 flex-row items-center rounded-full px-3 hover:bg-accent"
        >
          <Text class="text-sm text-foreground">Templates</Text>
        </Button>
      </If>
      <If when={props.route.name === "browse" && appCount() > 0}>
        <ConnectedButton />
      </If>
      <If when={props.route.name === "browse" || props.route.name === "manage"}>
        <AddMenu />
      </If>
      <IconButton icon="x" label="Close integrations" onPress={close} />
    </View>
  );
}

/** One view, chosen by its route: a route's object never changes under a mounted page. */
function Screen(props: { route: Route }): JSX.Element {
  const route = props.route;
  if (route.name === "manage") return <Manage />;
  if (route.name === "github") return <GithubImport />;
  if (route.name === "source") return <SourceForm kind={route.kind} preset={route.preset} />;
  if (route.name === "mcp") return <McpBrowse />;
  if (route.name === "templates") return <Templates />;
  if (route.name === "template") return <If when={templateBySlug(route.slug)}>{(template) => <TemplateDetail template={template()} />}</If>;
  if (route.name === "plugin") return <PluginDetail source={route.source} />;
  if (route.name === "connector") return <If when={appById(route.id)}>{(app) => <ConnectorDetail app={app()} />}</If>;
  return <Browse />;
}

function Content(props: { route: Route }) {
  return (
    <Scroll class="flex-1" contentClass={wide() ? "items-center px-8 py-6" : "px-4 py-6 pb-[env(safe-area-inset-bottom)]"}>
      <View class="w-full max-w-3xl">
        <Screen route={props.route} />
      </View>
    </Scroll>
  );
}

export function IntegrationsModal() {
  // Closed, it forgets where it was: the next opening starts at Browse.
  effect(() => {
    if (integrationsOpen()) return;
    untracked(() => {
      stack.setRoutes([{ name: "browse" }]);
      resetBrowse();
      resetTemplates();
    });
  });
  return (
    <Dialog
      open={integrationsOpen()}
      onOpenChange={({ open }) => integrationsOpen.set(open)}
      animation="fade"
      presentation="fullScreen"
      class="flex-1 bg-background"
      testID="integrations"
    >
      <If
        when={wide()}
        else={
          <NavStack state={stack} class="flex-1">
            {(route) => (
              <NavPage title={titleOf(route)} header={<Header route={route} />} class="bg-background">
                <Content route={route} />
              </NavPage>
            )}
          </NavStack>
        }
      >
        <View class="flex-1">
          <Header route={top()} />
          <Each of={[top()]} key={(route) => JSON.stringify(route)}>
            {(route) => <Content route={route()} />}
          </Each>
        </View>
      </If>
    </Dialog>
  );
}

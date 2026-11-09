// What every Integrations view shares: logos, rows, tiles and the removal confirmation.
import { type JSX, Text, View } from "nsh";
import { AlertDialog, Button } from "nsh/base";
import { Icon, SectionTitle, TextButton } from "../../components/ui";
import { wide } from "../../nav";
import { type App, connectApp, isConnected, type Plugin } from "./catalog";
import { go } from "./route";

/** The first letter on a tile: the app's brand mark stands in until it has one. */
export function Logo(props: { name: string; large?: boolean }) {
  return (
    <View
      class={`${props.large ? "size-14 rounded-2xl" : "size-10 rounded-xl"} shrink-0 items-center justify-center border border-border bg-muted`}
    >
      <Text class={`${props.large ? "text-2xl" : "text-base"} font-semibold text-foreground`}>{props.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** A list row: logo, name and a line under it, with trailing actions; it opens when `onOpen` is given. */
export function Row(props: {
  name: string;
  detail?: string;
  status?: JSX.Element;
  mark?: JSX.Element;
  openLabel?: string;
  onOpen?: () => void;
  children?: JSX.Element;
}) {
  const body = () => (
    <>
      {props.mark ?? <Logo name={props.name} />}
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class="truncate font-medium text-foreground">{props.name}</Text>
        <If when={props.detail}>{(d) => <Text class="truncate text-sm text-muted-foreground">{d()}</Text>}</If>
        {props.status}
      </View>
    </>
  );
  return (
    <View class="min-w-0 flex-row items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-accent/60">
      <If when={props.onOpen} else={<View class="min-w-0 flex-1 flex-row items-center gap-3">{body()}</View>}>
        {(open) => (
          <Button accessibilityLabel={props.openLabel} onPress={() => open()()} class="min-w-0 flex-1 flex-row items-center gap-3">
            {body()}
          </Button>
        )}
      </If>
      {props.children}
    </View>
  );
}

/** Two columns of rows on wide windows, one on phones. */
export function Grid(props: { children: JSX.Element }) {
  return <View class="flex-row flex-wrap">{props.children}</View>;
}

export function Cell(props: { children: JSX.Element }) {
  return <View class={wide() ? "w-1/2" : "w-full"}>{props.children}</View>;
}

/** An app in the catalog with its Add or Added button; a connected app opens its page. */
export function AppTile(props: { app: App }) {
  const added = () => isConnected(props.app.id);
  const open = () => go({ name: "connector", id: props.app.id });
  return (
    <Row name={props.app.name} openLabel={`Open ${props.app.name}`} onOpen={added() ? open : undefined}>
      <TextButton
        variant="secondary"
        label={added() ? "Added" : "Add"}
        accessibilityLabel={`${added() ? "Added" : "Add"} ${props.app.name}`}
        onPress={() => (added() ? open() : connectApp(props.app.id))}
      />
    </Row>
  );
}

/** A marketplace plugin: its page opens from the row or its Add button. */
export function PluginRow(props: { plugin: Plugin; installed: boolean }) {
  const open = () => go({ name: "plugin", source: props.plugin.source });
  return (
    <Row name={props.plugin.displayName} detail={props.plugin.description} openLabel={`Open ${props.plugin.displayName}`} onOpen={open}>
      <TextButton
        variant="secondary"
        label={props.installed ? "Added" : "Add"}
        accessibilityLabel={`${props.installed ? "Added" : "Add"} ${props.plugin.displayName}`}
        onPress={open}
      />
    </Row>
  );
}

/** A group's heading, with a link to all of it when it has more. */
export function Section(props: { title: string; action?: JSX.Element; children: JSX.Element }) {
  return (
    <View class="mt-8 gap-2">
      <View class="flex-row items-center justify-between px-2.5">
        <SectionTitle>{props.title}</SectionTitle>
        {props.action}
      </View>
      {props.children}
    </View>
  );
}

/** One line of status: a mark and its words. */
export function ConnectionStatus(props: { state: "connected" | "needs-sign-in" }) {
  const connected = () => props.state === "connected";
  return (
    <View class="flex-row items-center gap-1">
      <Icon name={connected() ? "check" : "triangle-alert"} size={14} tone={connected() ? "success" : "warning"} />
      <Text class={`truncate text-sm ${connected() ? "text-success" : "text-warning"}`}>{connected() ? "Connected" : "Needs sign-in"}</Text>
    </View>
  );
}

/** Asks before removing something every space shares: connectors belong to the account. */
export async function confirmRemove(name: string) {
  const { action } = await AlertDialog.show({
    title: "Remove from every space?",
    description: name,
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Remove", role: "destructive", id: "yes" },
    ],
  });
  return action === "yes";
}

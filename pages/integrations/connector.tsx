// A connected app's page: its accounts, adding another, its tools, and uninstalling it.
import { signal, Text, View } from "nsh";
import { Button, Collapsible, Input } from "nsh/base";
import { fieldClass, Icon, TextButton } from "../../components/ui";
import { type App, accountsOf, addAccount, isConnected, removeAccount, renameAccount, toolLabel, uninstallApp } from "./catalog";
import { confirmRemove, Logo } from "./parts";
import { stack } from "./route";

const toolsOpen = signal(false);

/** Closes the page once the app is gone. */
const leaveIfGone = (id: string) => {
  if (!isConnected(id)) stack.pop();
};

export function ConnectorDetail(props: { app: App }) {
  return (
    <View class="gap-5">
      <View class="flex-row items-center gap-3">
        <Logo name={props.app.name} />
        <Text role="header" class="min-w-0 flex-1 truncate text-lg font-medium text-foreground">
          {props.app.name}
        </Text>
        <TextButton
          variant="secondary"
          label="Uninstall"
          onPress={() =>
            void confirmRemove(props.app.name).then((yes) => {
              if (!yes) return;
              uninstallApp(props.app.id);
              leaveIfGone(props.app.id);
            })
          }
        />
      </View>
      <View class="gap-1">
        <Each of={accountsOf(props.app.id)} key="index">
          {(label, index) => (
            <View class="flex-row items-center gap-2">
              <Input
                accessibilityLabel="Account label"
                value={label()}
                onChange={({ value }) => renameAccount(props.app.id, index(), value)}
                class={`${fieldClass} min-w-0 flex-1 border-transparent bg-transparent px-2 hover:bg-accent/60`}
              />
              <TextButton
                variant="ghost"
                label="Remove"
                accessibilityLabel={`Remove account ${label()}`}
                onPress={() => {
                  removeAccount(props.app.id, index());
                  leaveIfGone(props.app.id);
                }}
              />
            </View>
          )}
        </Each>
        <View class="items-start">
          <Button
            accessibilityLabel="Add another"
            onPress={() => addAccount(props.app.id)}
            class="min-h-9 flex-row items-center gap-1.5 rounded-full px-2 hover:bg-accent"
          >
            <Icon name="plus" size={14} tone="muted-foreground" />
            <Text class="text-sm text-muted-foreground">Add another</Text>
          </Button>
        </View>
      </View>
      <If when={props.app.tools.length > 0}>
        <Collapsible
          open={toolsOpen()}
          content={
            <View class="flex-row flex-wrap gap-1.5 pt-3">
              <Each of={props.app.tools} key={(t) => t}>
                {(tool) => (
                  <View class="rounded-full bg-secondary px-2.5 py-1">
                    <Text class="text-xs text-secondary-foreground">{toolLabel(tool(), props.app)}</Text>
                  </View>
                )}
              </Each>
            </View>
          }
        >
          <View
            role="button"
            accessibilityLabel="Tools"
            onPress={() => toolsOpen.update((o) => !o)}
            class="flex-row items-center gap-1 px-2"
          >
            <Text class="text-sm text-muted-foreground">{props.app.tools.length === 1 ? "1 tool" : `${props.app.tools.length} tools`}</Text>
            <Icon name={toolsOpen() ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
          </View>
        </Collapsible>
      </If>
    </View>
  );
}

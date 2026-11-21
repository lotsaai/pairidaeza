// A new group chat: a name and 2–10 bots. Beside the chat on roomy windows, a sheet on wide ones, a page on phones.
import { Scroll, signal, Text, View } from "nsh";
import { Checkbox, Input, Sheet } from "nsh/base";
import { BotFace, Field, fieldClass, Icon, IconButton, TextButton } from "../components/ui";
import { newGroupOpen, nav, openChat, roomy, wide } from "../nav";
import { botsInSpace, createGroup, currentSpaceId, GROUP_MEMBER_MAX, GROUP_MEMBER_MIN, GROUP_NAME_MAX_LENGTH } from "../store";
import { SidePanel } from "./PanelResize";

export function NewGroupForm(props: { onClose: () => void }) {
  const name = signal("");
  const filter = signal("");
  const picked = signal<string[]>([]);
  const onlySelected = signal(false);

  const shown = () => {
    const q = filter().trim().toLowerCase();
    return botsInSpace(currentSpaceId()).filter((b) => b.name.toLowerCase().includes(q) && (!onlySelected() || picked().includes(b.id)));
  };
  const ready = () => name().trim().length > 0 && picked().length >= GROUP_MEMBER_MIN && picked().length <= GROUP_MEMBER_MAX;
  const toggle = (id: string, on: boolean) =>
    picked.update((all) => (on ? (all.includes(id) || all.length >= GROUP_MEMBER_MAX ? all : [...all, id]) : all.filter((x) => x !== id)));
  const create = () => {
    if (!ready()) return;
    const id = createGroup(name(), picked());
    openChat(id);
    props.onClose();
  };

  return (
    <View class="flex-1 bg-background">
      <View class="flex-row items-center gap-3 px-4 pt-3 pb-2">
        <Text role="header" class="flex-1 text-lg font-semibold text-foreground">
          New group
        </Text>
        <IconButton icon="x" label="Cancel new group" onPress={props.onClose} />
      </View>
      <Scroll class="flex-1" contentClass="gap-4 p-4">
        <Field label="Name">
          <Input
            value={name()}
            onChange={({ value }) => name.set(value)}
            placeholder="Name group"
            maxLength={GROUP_NAME_MAX_LENGTH}
            accessibilityLabel="Name"
            class={fieldClass}
          />
        </Field>
        <View class="gap-2">
          <View class="flex-row items-center justify-between px-1">
            <Text class="text-sm font-medium text-foreground">{`Members (${picked().length})`}</Text>
            <TextButton
              label={onlySelected() ? "Show all" : "Show selected"}
              variant="ghost"
              onPress={() => onlySelected.update((v) => !v)}
            />
          </View>
          <Input
            value={filter()}
            onChange={({ value }) => filter.set(value)}
            placeholder="Filter bots"
            accessibilityLabel="Filter bots"
            class={fieldClass}
          />
          <Text class="px-1 text-sm text-muted-foreground">{`Pick ${GROUP_MEMBER_MIN}–${GROUP_MEMBER_MAX}`}</Text>
          <If when={shown().length > 0} else={<Text class="px-1 py-3 text-sm text-muted-foreground">No bots match</Text>}>
            <View class="gap-1">
              <Each of={shown()} key={(b) => b.id}>
                {(bot) => (
                  <Checkbox
                    checked={picked().includes(bot().id)}
                    disabled={!picked().includes(bot().id) && picked().length >= GROUP_MEMBER_MAX}
                    onChange={({ checked }) => toggle(bot().id, checked)}
                    accessibilityLabel={picked().includes(bot().id) ? `Remove ${bot().name} from group` : `Add ${bot().name} group`}
                    class="min-h-11 flex-row items-center gap-3 rounded-(--radius) px-2 py-1.5 hover:bg-accent disabled:opacity-40"
                    indicatorClass="size-5 items-center justify-center rounded-sm border border-input checked:border-primary checked:bg-primary"
                    indicator={
                      <If when={picked().includes(bot().id)}>
                        <Icon name="check" size={14} tone="primary-foreground" />
                      </If>
                    }
                  >
                    <BotFace bot={bot()} size={32} />
                    <Text class="flex-1 text-foreground">{bot().name}</Text>
                  </Checkbox>
                )}
              </Each>
            </View>
          </If>
        </View>
      </Scroll>
      <View class="flex-row justify-end border-t border-border p-3">
        <View class={ready() ? "" : "opacity-40"}>
          <TextButton label="Create group" variant="primary" onPress={create} />
        </View>
      </View>
    </View>
  );
}

const close = () => newGroupOpen.set(false);

/** The form beside the chat on roomy windows. */
export function NewGroupPanelSide() {
  return (
    <If when={roomy() && newGroupOpen()}>
      <SidePanel>
        <NewGroupForm onClose={close} />
      </SidePanel>
    </If>
  );
}

/** The form as a sheet on wide windows too narrow to keep it beside the chat. */
export function NewGroupPanelSheet() {
  return (
    <Sheet
      open={wide() && !roomy() && newGroupOpen()}
      onOpenChange={({ open }) => !open && close()}
      side="right"
      backdropClass="bg-overlay"
      popupClass="h-full w-96 max-w-full border-l border-border bg-background pt-[env(safe-area-inset-top)]"
    >
      <If when={newGroupOpen()}>
        <NewGroupForm onClose={close} />
      </If>
    </Sheet>
  );
}

/** The phone's page for the form. */
export function NewGroupPage() {
  return (
    <NewGroupForm
      onClose={() => {
        close();
        nav.pop();
      }}
    />
  );
}

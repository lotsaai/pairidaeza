// The + menu: New bot, New group chat, New private space, then every bot of the space to open.
import { platform, Scroll, signal, Text, View } from "nsh";
import { Button, Command, Input, Popover, Tooltip } from "nsh/base";
import { BotFace, Icon, IconButton, type IconName, popupClass } from "../../components/ui";
import { newBotOpen, newSpaceOpen, openNewGroup } from "../../nav";
import { botById, botsInSpace, currentSpaceId } from "../../store";
import { openSpaceChat } from "./state";

const open = signal(false);
const text = signal("");

const SPACE_HINT = "Private workspace with its own bots and groups.";

const items = () => {
  const needle = text().trim().toLowerCase();
  const showCreate = !needle || "new bot".includes(needle) || needle.split(/\s+/).every((part) => "new bot".includes(part));
  return [
    ...(showCreate ? [{ id: "new-bot", label: "New bot", group: "create" }] : []),
    { id: "new-group", label: "New group chat", group: "create" },
    { id: "new-space", label: "New private space", group: "create" },
    ...botsInSpace(currentSpaceId())
      .filter((b) => !needle || b.name.toLowerCase().includes(needle))
      .map((b) => ({ id: `bot:${b.id}`, label: b.name, group: "bots" })),
  ];
};

const ICONS: Record<string, IconName> = { "new-bot": "plus", "new-group": "users", "new-space": "lock" };

function choose(id: string) {
  open.set(false);
  text.set("");
  if (id === "new-bot") newBotOpen.set(true);
  else if (id === "new-group") openNewGroup();
  else if (id === "new-space") newSpaceOpen.set(true);
  else openSpaceChat(id.slice("bot:".length));
}

/** Shown on the row when it is highlighted; pressing it explains without choosing the row. */
function RowHint(props: { label: string }) {
  return (
    <View
      accessibilityLabel={props.label}
      onPress={() => {}}
      tooltip={
        <Tooltip placement="right" class="max-w-60 rounded-md border border-border bg-popover px-2 py-1 shadow-md shadow-shadow-color">
          <Text class="text-xs text-popover-foreground">{props.label}</Text>
        </Tooltip>
      }
      class="rounded p-1 opacity-0 group-focus:opacity-100"
    >
      <Icon name="info" size={14} tone="muted-foreground" />
    </View>
  );
}

function PickerRow(props: { entry: { id: string; label: string } }) {
  return (
    <View class="flex-row items-center gap-2">
      <View class="size-[22px] items-center justify-center">
        <If
          when={ICONS[props.entry.id]}
          else={<If when={botById(props.entry.id.slice("bot:".length))}>{(bot) => <BotFace bot={bot()} size={22} />}</If>}
        >
          {(icon) => <Icon name={icon()} size={16} />}
        </If>
      </View>
      <Text class="min-w-0 flex-1 truncate text-sm text-popover-foreground">{props.entry.label}</Text>
      <If when={props.entry.id === "new-space"}>
        <RowHint label={SPACE_HINT} />
      </If>
    </View>
  );
}

// Command does not expose its internal Scroll's keyboard tap policy.
function TouchPicker() {
  return (
    <View testID="bot-create-picker">
      <View class="min-h-10 flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Text class="shrink-0 text-sm text-muted-foreground">To:</Text>
        <Input
          value={text()}
          onChange={({ value }) => text.set(value)}
          onSubmit={() => {
            const first = items().at(0);
            if (first) choose(first.id);
          }}
          autoFocus
          placeholder="Search"
          accessibilityLabel="Create or open a bot"
          class="min-w-0 flex-1 text-left text-popover-foreground placeholder:text-muted-foreground"
        />
      </View>
      <Scroll keyboardShouldPersistTaps="handled" class="h-80" contentClass="p-1">
        <Each of={items()} key={(entry) => entry.id}>
          {(entry) => (
            <Button
              accessibilityLabel={entry().label}
              onPress={() => choose(entry().id)}
              class="group min-h-11 justify-center rounded-md px-2.5 py-1.5 text-sm text-popover-foreground active:bg-accent focus:bg-accent"
            >
              <PickerRow entry={entry()} />
            </Button>
          )}
        </Each>
      </Scroll>
    </View>
  );
}

export function CreateMenu() {
  return (
    <Popover
      open={open()}
      onOpenChange={({ open: next }) => {
        open.set(next);
        if (!next) text.set("");
      }}
      placement="right"
      align="start"
      offset={4}
      popupClass={`${popupClass} w-80 overflow-hidden p-0`}
      trigger={<IconButton icon="plus" label="Create" selected={open()} />}
    >
      <If when={platform.desktop} else={<TouchPicker />}>
        <Command
          testID="bot-create-picker"
          items={items()}
          query={text()}
          onQueryChange={({ query }) => text.set(query)}
          filterable={false}
          autoFocus
          placeholder="Search"
          accessibilityLabel="Create or open a bot"
          // "To:" inline before the field, left-aligned.
          searchPrefix={<Text class="shrink-0 text-sm text-muted-foreground">To:</Text>}
          onSelect={({ id }) => choose(id)}
          onCancel={() => open.set(false)}
          searchBarClass="min-h-10 flex-row items-center gap-2 border-b border-border px-3 py-2"
          searchClass="min-w-0 flex-1 text-left text-popover-foreground placeholder:text-muted-foreground"
          listClass="max-h-80 p-1"
          itemClass="group rounded-md px-2.5 py-1.5 text-sm text-popover-foreground focus:bg-accent"
          separatorClass="my-1 h-px bg-border"
          renderGroup={() => <View />}
          renderItem={(entry) => <PickerRow entry={entry} />}
          empty={
            <View class="p-4">
              <Text class="text-center text-sm text-muted-foreground">No bots match</Text>
            </View>
          }
        />
      </If>
    </Popover>
  );
}

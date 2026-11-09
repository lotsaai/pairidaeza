// Snoozed and Archived: folded lists at the foot of the sidebar that open upward, capped together at 40% of the window.
import { type JSX, Scroll, signal, Text, View, windowSize } from "nsh";
import { Button, Collapsible } from "nsh/base";
import { AppContextMenu, ChatAvatar, Icon, MenuRow } from "../../components/ui";
import { archivedChats, botsOfChat, type Chat, setChatArchived, snoozeChat, snoozedChats } from "../../store";
import { confirmDelete, wakeLabel } from "../chatActions";
import { openSpaceChat } from "./state";

function Shelf(props: { label: string; count: number; children: JSX.Element }) {
  const open = signal(false);
  return (
    <Collapsible open={open()} content={<View class="gap-0.5">{props.children}</View>}>
      <View
        role="button"
        accessibilityLabel={props.label}
        accessibilityState={{ expanded: open() }}
        onPress={() => open.update((o) => !o)}
        class="flex-row items-center gap-1.5 rounded-(--radius) px-3 py-1.5 hover:bg-sidebar-accent/60"
      >
        <Text class="flex-1 text-xs font-medium text-muted-foreground">{props.label}</Text>
        <Text class="text-xs text-muted-foreground tabular-nums">{String(props.count)}</Text>
        <Icon name={open() ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
      </View>
    </Collapsible>
  );
}

/** A chat on a shelf: opens on press, with its one action always visible. */
function ShelfRow(props: { chat: Chat; meta?: string; action: string; onAction: () => void }) {
  return (
    <View class="flex-row items-center gap-1 rounded-(--radius) pe-1 hover:bg-sidebar-accent/60">
      <Button
        accessibilityLabel={props.chat.title}
        onPress={() => openSpaceChat(props.chat.id)}
        class="min-w-0 flex-1 flex-row items-center gap-2 rounded-(--radius) px-3 py-1.5"
      >
        <ChatAvatar bots={botsOfChat(props.chat.id)} size={28} />
        <Text class="flex-1 truncate text-sm text-sidebar-foreground">{props.chat.title}</Text>
        <If when={props.meta}>{(meta) => <Text class="text-xs text-muted-foreground tabular-nums">{meta()}</Text>}</If>
      </Button>
      <Button
        accessibilityLabel={`${props.action} ${props.chat.title}`}
        onPress={props.onAction}
        class="rounded-full px-2.5 py-1 hover:bg-accent active:bg-accent"
      >
        <Text class="text-xs font-medium text-foreground">{props.action}</Text>
      </Button>
    </View>
  );
}

export function Shelves() {
  return (
    <Scroll class="shrink-0 grow-0" style={{ maxHeight: windowSize().height * 0.4 }} contentClass="px-2">
      <If when={snoozedChats().length > 0}>
        <Shelf label="Snoozed" count={snoozedChats().length}>
          <Each of={snoozedChats()} key={(c) => c.id}>
            {(chat) => (
              <ShelfRow
                chat={chat()}
                meta={wakeLabel(new Date(chat().snoozedUntil ?? 0))}
                action="Unsnooze"
                onAction={() => snoozeChat(chat().id, null)}
              />
            )}
          </Each>
        </Shelf>
      </If>
      <If when={archivedChats().length > 0}>
        <Shelf label="Archived" count={archivedChats().length}>
          <Each of={archivedChats()} key={(c) => c.id}>
            {(chat) => (
              <AppContextMenu trigger={<ShelfRow chat={chat()} action="Restore" onAction={() => setChatArchived(chat().id, false)} />}>
                <MenuRow icon="archive-restore" label="Restore" onSelect={() => setChatArchived(chat().id, false)} />
                <MenuRow icon="trash" label="Delete…" destructive onSelect={() => void confirmDelete(chat().id)} />
              </AppContextMenu>
            )}
          </Each>
        </Shelf>
      </If>
    </Scroll>
  );
}

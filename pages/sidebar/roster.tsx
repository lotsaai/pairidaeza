// The chat list: a space's Pinned, sections and Chats as foldable groups of rows, or the 72pt rail of tiles. Bot rows drag and reorder.
import { type Bounds, computed, List, PanResponder, platform, Text, View } from "nsh";
import { AlertDialog, Tooltip } from "nsh/base";
import { AppContextMenu, AppMenu, ChatAvatar, Icon, MenuRow } from "../../components/ui";
import { nameSection, selectedChatId, sidebarDensity, sidebarRail, spaceSettingsId, wide } from "../../nav";
import {
  allSections,
  allSpaces,
  botsOfChat,
  type Chat,
  chatById,
  deleteSection,
  deleteSpace,
  GROUP_MEMBER_MAX,
  hasWoken,
  joinGroup,
  latestRun,
  listedChats,
  reorderChat,
  setChatSection,
  setCurrentSpace,
  spaceById,
} from "../../store";
import { ChatActions } from "../chatActions";
import {
  type DropAction,
  type DropSource,
  type DropTarget,
  resolveDrop,
  rowAt,
  type SidebarGroup,
  sidebarGroups,
  WORK_LINE,
} from "./logic";
import { activityMode, draggedId, dropKey, focusedRowId, isOpen, openSpaceChat, query, toggle } from "./state";

type Row = { kind: "header"; id: string; group: SidebarGroup } | { kind: "chat"; id: string; chat: Chat; group: SidebarGroup };

/** The rail has no search; otherwise the search text narrows chats. */
const needle = () => (sidebarRail() || activityMode() ? "" : query().trim().toLowerCase());

const groups = computed(() => sidebarGroups({ spaces: allSpaces(), chats: listedChats(), sections: allSections(), query: needle() }));

const rows = computed<Row[]>(() => {
  const rail = sidebarRail();
  return groups().flatMap((group): Row[] => {
    const chats = rail || isOpen(group.key) ? group.chats.map((chat) => ({ kind: "chat" as const, id: chat.id, chat, group })) : [];
    return rail ? chats : [{ kind: "header", id: `h:${group.key}`, group }, ...chats];
  });
});

/** The list's items are row ids, so a change to a chat's data keeps its rows (and what the list measured of them). */
const rowIds = computed(() => rows().map((r) => r.id));
const rowById = computed(() => new Map(rows().map((r) => [r.id, r])));

/** The first tile of every group after the first: the rail separates groups with a line. */
const separatedIds = computed(() => {
  const ids = new Set<string>();
  if (!sidebarRail()) return ids;
  let seen = false;
  for (const g of groups()) {
    if (g.chats.length === 0) continue;
    if (seen) ids.add(g.chats[0].id);
    seen = true;
  }
  return ids;
});

const isBot = (chat: Chat) => chat.botIds.length === 1;

/** Moves a bot row one place within its group, none past the ends. */
export function moveRow(id: string, step: -1 | 1) {
  const row = rows().find((r) => r.id === id);
  if (row?.kind !== "chat" || !isBot(row.chat)) return;
  const ids = row.group.chats.filter(isBot).map((c) => c.id);
  const target = ids[ids.indexOf(id) + step];
  if (target) reorderChat(id, target);
}

// Rows report their height so a drag can tell which row it ends over; unseen rows count as typical ones.
const heights = new Map<string, number>();
const measure = (id: string) => (e: { bounds: Bounds }) => void heights.set(id, e.bounds.size.height);
const heightOf = (row: Row) =>
  heights.get(row.id) ?? (row.kind === "header" ? 36 : sidebarRail() ? 48 : sidebarDensity() === "compact" ? 44 : 64);

function dropTarget(row: Row): DropTarget | null {
  if (row.kind === "header") {
    const { kind, spaceId, sectionId } = row.group;
    return kind === "section" || kind === "chats" ? { kind: "section", spaceId, sectionId } : null;
  }
  const { chat, group } = row;
  return isBot(chat)
    ? { kind: "bot", id: chat.id, spaceId: chat.spaceId, pinned: !!chat.pinned, sectionId: group.sectionId }
    : { kind: "group", id: chat.id, spaceId: chat.spaceId, memberIds: chat.botIds };
}

/** Where a bot row dragged `dy` points would land, and what dropping there does. */
function dropAt(id: string, dy: number): { key: string; action: DropAction; source: DropSource } | null {
  const list = rows();
  const from = list.findIndex((r) => r.id === id);
  const source = list[from];
  if (source?.kind !== "chat") return null;
  const over = list[rowAt(list.map(heightOf), from, dy)];
  const target = dropTarget(over);
  const dragged = {
    id,
    botId: source.chat.botIds[0],
    spaceId: source.chat.spaceId,
    pinned: !!source.chat.pinned,
    sectionId: source.group.sectionId,
  };
  const action = target && resolveDrop(dragged, target, GROUP_MEMBER_MAX);
  return action ? { key: over.id, action, source: dragged } : null;
}

function drop(id: string, dy: number) {
  const hit = dropAt(id, dy);
  if (!hit) return;
  const { action, source } = hit;
  if (action.action === "reorder") reorderChat(id, action.targetId);
  else if (action.action === "move") setChatSection(id, action.sectionId);
  else joinGroup(action.groupId, source.botId);
}

async function confirmDeleteSpace(id: string) {
  const { action } = await AlertDialog.show({
    title: `Delete "${spaceById(id)?.name}"?`,
    description: "Its bots, groups and chats go too. This can't be undone.",
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Delete space", role: "destructive", id: "delete" },
    ],
  });
  if (action === "delete") deleteSpace(id);
}

function SpaceActions(props: { spaceId: string; name: string }) {
  return (
    <AppMenu
      align="end"
      trigger={
        <View
          role="button"
          accessibilityLabel={`Actions for ${props.name}`}
          class="mt-2 size-7 items-center justify-center rounded-full hover:bg-sidebar-accent/60"
        >
          <Icon name="more-horizontal" size={16} tone="muted-foreground" />
        </View>
      }
    >
      <MenuRow icon="settings" label="Settings" onSelect={() => spaceSettingsId.set(props.spaceId)} />
      <If when={!spaceById(props.spaceId)?.isDefault}>
        <MenuRow icon="trash" label="Delete space" destructive onSelect={() => void confirmDeleteSpace(props.spaceId)} />
      </If>
    </AppMenu>
  );
}

/** A group's title: the space (with its lock or users icon) over the muted section name once there are several spaces. */
function HeaderTitle(props: { group: () => SidebarGroup }) {
  const g = props.group;
  const toggleButton = () => (
    <View
      role="button"
      accessibilityLabel={g().kind === "empty" ? `Open ${g().title}` : g().subtitle ? `${g().title}, ${g().subtitle}` : g().title}
      accessibilityState={g().kind === "empty" ? {} : { expanded: isOpen(g().key) }}
      onPress={() => (g().kind === "empty" ? setCurrentSpace(g().spaceId) : toggle(g().key))}
      class="min-w-0 flex-1 flex-row items-center gap-1.5 rounded-(--radius) px-3 pt-3 pb-1 hover:bg-sidebar-accent/60"
    >
      <If when={g().showLock}>
        <Icon name={g().shared ? "users" : "lock"} size={12} tone="muted-foreground" />
      </If>
      <View class="min-w-0 flex-1">
        <Text role="header" class="truncate text-xs font-medium text-muted-foreground">
          {g().title}
        </Text>
        <If when={g().subtitle}>{(subtitle) => <Text class="truncate text-xs text-muted-foreground">{subtitle()}</Text>}</If>
      </View>
      <If when={g().kind !== "empty"}>
        <Icon name={isOpen(g().key) ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
      </If>
    </View>
  );
  return (
    <If when={g().kind === "section" ? g().sectionId : null} else={toggleButton()}>
      {(id) => (
        <AppContextMenu trigger={toggleButton()}>
          <MenuRow icon="pencil" label="Rename section…" onSelect={() => nameSection({ id: id() }, g().subtitle ?? g().title)} />
          <MenuRow icon="trash" label="Delete section" destructive onSelect={() => deleteSection(id())} />
        </AppContextMenu>
      )}
    </If>
  );
}

function RosterHeader(props: { groupKey: string }) {
  const group = computed(() => groups().find((g) => g.key === props.groupKey));
  const id = `h:${props.groupKey}`;
  return (
    <If when={group()}>
      {(g) => (
        <View onLayout={measure(id)} class="flex-row items-center rounded-(--radius)" classList={{ "bg-sidebar-accent": dropKey() === id }}>
          <HeaderTitle group={g} />
          <If when={g().firstOfSpace}>
            <SpaceActions spaceId={g().spaceId} name={g().spaceName} />
          </If>
        </View>
      )}
    </If>
  );
}

function ChatRow(props: { chatId: string }) {
  const chat = () => chatById(props.chatId);
  const status = () => latestRun(props.chatId)?.status;
  const workLine = () => (status() ? WORK_LINE[status()!] : undefined);
  const compact = () => sidebarDensity() === "compact";
  const failed = () => status() === "failed";
  const unread = () => !!chat()?.unread;
  const highlighted = () => (wide() && selectedChatId() === props.chatId) || dropKey() === props.chatId;
  const woke = () => {
    const c = chat();
    return !!c && hasWoken(c);
  };
  const separated = () => separatedIds().has(props.chatId);
  const rowClass = () =>
    `hover:bg-sidebar-accent/60 active:bg-sidebar-accent focus:bg-sidebar-accent/60 selected:bg-sidebar-accent ${
      sidebarRail()
        ? "mx-auto size-12 items-center justify-center rounded-xl"
        : compact()
          ? "min-h-11 flex-row items-center gap-2 rounded-(--radius) px-3 py-1.5"
          : "flex-row items-center gap-3 rounded-(--radius) px-3 py-2.5"
    }`;

  // A bot row follows the pointer on desktops; touch screens keep the drag for scrolling.
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) =>
      platform.desktop && !!chat() && isBot(chat()!) && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => draggedId.set(props.chatId),
    onPanResponderMove: (_e, g) => dropKey.set(dropAt(props.chatId, g.dy)?.key ?? null),
    onPanResponderRelease: (_e, g) => {
      drop(props.chatId, g.dy);
      draggedId.set(null);
      dropKey.set(null);
    },
    onPanResponderTerminate: () => {
      draggedId.set(null);
      dropKey.set(null);
    },
  });

  return (
    <View onLayout={measure(props.chatId)} class={separated() ? "mt-2 border-t border-sidebar-border pt-2" : ""}>
      <AppContextMenu
        trigger={
          <View
            role="button"
            accessibilityLabel={chat()?.title}
            accessibilityState={{ selected: wide() && selectedChatId() === props.chatId }}
            onPress={() => openSpaceChat(props.chatId)}
            onFocus={() => focusedRowId.set(props.chatId)}
            onBlur={() => focusedRowId.update((id) => (id === props.chatId ? null : id))}
            {...pan.panHandlers}
            class={rowClass()}
            classList={{ "bg-sidebar-accent": dropKey() === props.chatId }}
            style={{ opacity: draggedId() === props.chatId ? 0.55 : 1 }}
            tooltip={
              sidebarRail() ? (
                <Tooltip placement="right" class="rounded-md bg-foreground px-2 py-1">
                  <Text class="text-xs text-background">{workLine() ? `${chat()?.title}: ${workLine()}` : chat()?.title}</Text>
                </Tooltip>
              ) : undefined
            }
          >
            <If
              when={!sidebarRail()}
              else={
                <View>
                  <ChatAvatar bots={botsOfChat(props.chatId)} size={40} />
                  <If when={unread()}>
                    <View
                      class="absolute -right-0.5 top-0 size-2.5 rounded-full border-2 border-sidebar bg-unread"
                      accessibilityLabel="Unread"
                    />
                  </If>
                  <If when={failed()}>
                    <View
                      class="absolute -right-0.5 bottom-0 size-2.5 rounded-full border-2 border-sidebar bg-destructive"
                      accessibilityLabel="Error"
                    />
                  </If>
                </View>
              }
            >
              <ChatAvatar bots={botsOfChat(props.chatId)} size={compact() ? 28 : 40} />
              <View class="min-w-0 flex-1 gap-0.5">
                <View class="flex-row items-center gap-2">
                  <Text
                    class={`flex-1 truncate ${highlighted() ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"} ${unread() ? "font-semibold" : "font-medium"}`}
                  >
                    {chat()?.title}
                  </Text>
                  <If
                    when={woke()}
                    else={
                      <If when={!compact()}>
                        <Text class={`text-xs ${highlighted() ? "text-sidebar-accent-foreground" : "text-muted-foreground"}`}>
                          {chat()?.time}
                        </Text>
                      </If>
                    }
                  >
                    <Text class={`text-xs font-medium ${highlighted() ? "text-sidebar-accent-foreground" : "text-foreground"}`}>Woke</Text>
                  </If>
                  <If when={compact() && unread()}>
                    <View class="size-2 rounded-full bg-unread" accessibilityLabel="Unread" />
                  </If>
                </View>
                <If when={compact() ? workLine() : (workLine() ?? chat()?.preview)}>
                  {(line) => (
                    <View class="flex-row items-center gap-2">
                      <Text
                        class={`flex-1 truncate text-sm ${highlighted() ? "text-sidebar-accent-foreground" : failed() ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {line()}
                      </Text>
                      <If when={!compact() && unread()}>
                        <View class="size-2 rounded-full bg-unread" accessibilityLabel="Unread" />
                      </If>
                    </View>
                  )}
                </If>
              </View>
            </If>
          </View>
        }
      >
        <ChatActions chatId={props.chatId} />
      </AppContextMenu>
    </View>
  );
}

export function Roster() {
  return (
    <List
      each={rowIds()}
      keyExtractor={(id) => id}
      estimatedItemSize={64}
      keyboardShouldPersistTaps="handled"
      class="flex-1"
      contentClass={sidebarRail() ? "pb-2" : "px-2 pb-2"}
    >
      {(id) => (
        // Keyed by the row's id: a reused cell rebuilds for its new row rather than keep the old one's kind.
        <Each of={[id()]} key={(i) => i}>
          {(i) => {
            const it = rowById().get(i());
            if (!it) return null;
            return it.kind === "header" ? <RosterHeader groupKey={it.group.key} /> : <ChatRow chatId={it.chat.id} />;
          }}
        </Each>
      )}
    </List>
  );
}

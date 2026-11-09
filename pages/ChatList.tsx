// The chats: the desktop sidebar and the phone's first page. Its list shows chats by space and section, or Activity: what the bots are doing.
import { batch, cleanup, computed, effect, keymap, Text, View } from "nsh";
import { Input } from "nsh/base";
import { fieldClass, IconButton } from "../components/ui";
import { currentSpaceId, spaceById } from "../store";
import { selectedChatId, sidebarCollapsed, sidebarRail, wide } from "../nav";
import { AccountMenu } from "./AccountMenu";
import { ActivityList, appliedFilterCount, FilterToggle } from "./sidebar/activity";
import { CreateMenu } from "./sidebar/create-menu";
import { moveRow, Roster } from "./sidebar/roster";
import { Shelves } from "./sidebar/shelves";
import { activityFilters, activityMode, filtersExpanded, focusedRowId, query, searchOpen } from "./sidebar/state";

/** The field shows while opened, while text or filters are in it, or while the filter fields are out (Activity). */
const searchShown = computed(
  () => !sidebarRail() && (searchOpen() || (activityMode() ? appliedFilterCount() > 0 || filtersExpanded() : query() !== "")),
);

function closeSearch() {
  batch(() => {
    if (activityMode()) activityFilters.update((f) => ({ ...f, query: "" }));
    else query.set("");
    searchOpen.set(false);
  });
}

/** A collapsed rail opens first: search and Activity need room. */
const expand = () => sidebarCollapsed.set(false);

function Header() {
  const rail = sidebarRail;
  return (
    <View class={rail() ? "items-center gap-0.5 pt-3 pb-2" : "flex-row items-center gap-1 px-3 pt-3 pb-2"}>
      <If when={!rail()}>
        <Text role="header" class="min-w-0 flex-1 truncate px-2 text-lg font-semibold text-sidebar-foreground">
          {activityMode() ? "Activity" : (spaceById(currentSpaceId())?.name ?? "")}
        </Text>
      </If>
      <IconButton
        icon="search"
        label="Search"
        selected={searchShown()}
        onPress={() => {
          if (searchShown()) return closeSearch();
          if (rail()) expand();
          searchOpen.set(true);
        }}
      />
      <IconButton
        icon="bell"
        label="Activity"
        selected={activityMode()}
        onPress={() => {
          if (rail()) expand();
          activityMode.update((on) => !on);
        }}
      />
      <If when={wide()}>
        <IconButton
          icon={rail() ? "panel-left-open" : "panel-left-close"}
          label={rail() ? "Show bots" : "Minimize bots"}
          onPress={() => sidebarCollapsed.update((c) => !c)}
        />
      </If>
      <CreateMenu />
    </View>
  );
}

function SearchField() {
  const text = () => (activityMode() ? activityFilters().query : query());
  return (
    <View class="flex-row items-center gap-1 px-3 pb-2">
      <Input
        value={text()}
        onChange={({ value }) => (activityMode() ? activityFilters.update((f) => ({ ...f, query: value })) : query.set(value))}
        autoFocus
        placeholder={activityMode() ? "Search runs" : "Search"}
        accessibilityLabel={activityMode() ? "Search runs" : "Search chats"}
        class={`${fieldClass} min-h-9 flex-1 text-sm`}
      />
      <If when={activityMode()}>
        <FilterToggle />
      </If>
    </View>
  );
}

export function ChatList() {
  // Escape closes the search field while it shows, even from inside it.
  effect(() => {
    if (searchShown()) cleanup(keymap.bind("escape", closeSearch, { when: "always" }));
  });
  // Alt+Up and Alt+Down move the focused bot row (else the open chat's) within its group.
  keymap.bind(
    { "alt+up": () => moveRow(focusedRowId() ?? selectedChatId(), -1), "alt+down": () => moveRow(focusedRowId() ?? selectedChatId(), 1) },
    { when: "notEditing", repeat: true },
  );
  return (
    <View class="flex-1 bg-sidebar">
      <Header />
      <If when={searchShown()}>
        <SearchField />
      </If>
      <If when={activityMode() && !sidebarRail()} else={<Roster />}>
        <ActivityList />
      </If>
      <If when={!activityMode() && !sidebarRail() && !query().trim()}>
        <Shelves />
      </If>
      <AccountMenu mini={sidebarRail()} />
    </View>
  );
}

// Activity: what the bots are doing, in sections, narrowed by search, status and dates.
import { computed, type JSX, Scroll, Text, View } from "nsh";
import { Button, type CalendarEntry, DatePicker, Select } from "nsh/base";
import { BotFace, ChatAvatar, Field, fieldClass, Icon, IconButton, popupClass, TextButton } from "../../components/ui";
import { allRuns, type Bot, botById, botsOfChat, type Chat, chatById, isSnoozed, listedChats, type Run } from "../../store";
import {
  activityAttention,
  appliedFilters,
  clearFilter,
  emptyFilters,
  filterCount,
  runMatches,
  STATUS_FILTERS,
  STATUS_LABEL,
} from "./logic";
import { activityFilters, filtersExpanded, isOpen, openSpaceChat, toggle } from "./state";

const applied = computed(() => appliedFilters(activityFilters()));
export const appliedFilterCount = computed(() => filterCount(applied()));

const STATUS_TONE: Record<Run["status"], string> = {
  queued: "text-foreground",
  running: "text-foreground",
  waiting_input: "text-warning",
  waiting_takeover: "text-warning",
  completed: "text-success",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

/** Each chat's newest run (a question or a stuck wait first), split into what needs the user, what is running, unread chats and the rest. */
const activity = computed(() => {
  const f = applied();
  const on = filterCount(f) > 0;
  const now = Date.now();
  const listed = allRuns().filter((run) => {
    const chat = chatById(run.chatId);
    return chat && !chat.archived && !isSnoozed(chat);
  });
  const matching = listed.filter((run) => {
    const chat = chatById(run.chatId) as Chat;
    return runMatches(run, `${botById(run.botId)?.name} ${chat.botIds.length > 1 ? chat.title : ""} ${run.summary}`.toLowerCase(), f);
  });
  const waiting = matching.filter((run) => activityAttention(run, false, now) === "needs_attention");
  const active = matching.filter((run) => run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled");
  const latest = new Map<string, Run>();
  for (const run of [...waiting, ...active, ...matching]) if (!latest.has(run.chatId)) latest.set(run.chatId, run);
  const unreadOf = (run: Run) => !!chatById(run.chatId)?.unread;
  const kind = (run: Run) => activityAttention(run, unreadOf(run), now);
  const runs = [...latest.values()];
  const attention = runs.filter((r) => kind(r) === "needs_attention");
  const working = runs.filter((r) => kind(r) === "working");
  const busy = new Set([...attention, ...working].map((r) => r.chatId));
  const settled = runs.filter((r) => !busy.has(r.chatId));
  // Filters narrow runs, so unread chats step aside and their matching runs stay in Recent.
  const unread = on ? [] : listedChats().filter((c) => c.unread && !busy.has(c.id));
  return {
    attention,
    working,
    unread,
    recent: on ? settled : settled.filter((r) => !unreadOf(r)),
    on,
    hasRuns: listed.length > 0,
    anyMatch: matching.length > 0,
  };
});

function Header(props: { groupKey: string; label: string; count: number; defaultOpen: boolean }) {
  const open = () => isOpen(props.groupKey, props.defaultOpen);
  return (
    <View
      role="button"
      accessibilityLabel={props.label}
      accessibilityState={{ expanded: open() }}
      onPress={() => toggle(props.groupKey)}
      class="flex-row items-center gap-1.5 rounded-(--radius) px-3 pt-3 pb-1 hover:bg-sidebar-accent/60"
    >
      <Text role="header" class="flex-1 truncate text-xs font-medium text-muted-foreground">
        {props.label}
      </Text>
      <Text class="text-xs text-muted-foreground tabular-nums">{String(props.count)}</Text>
      <Icon name={open() ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
    </View>
  );
}

function Section(props: { name: string; label: string; count: number; defaultOpen: boolean; children: JSX.Element }) {
  const key = `activity:${props.name}`;
  return (
    <If when={props.count > 0}>
      <Header groupKey={key} label={props.label} count={props.count} defaultOpen={props.defaultOpen} />
      <If when={isOpen(key, props.defaultOpen)}>{props.children}</If>
    </If>
  );
}

function RunRow(props: { run: Run; detailed: boolean }) {
  const bot = () => botById(props.run.botId);
  return (
    <Button
      accessibilityLabel={`${bot()?.name}, ${STATUS_LABEL[props.run.status]}`}
      onPress={() => openSpaceChat(props.run.chatId)}
      class="flex-row items-center gap-3 rounded-(--radius) px-3 py-2 hover:bg-sidebar-accent/60 active:bg-sidebar-accent"
    >
      <BotFace bot={bot() as Bot} size={28} />
      <View class="min-w-0 flex-1 gap-0.5">
        <View class="flex-row items-center gap-2">
          <Text class="flex-1 truncate font-medium text-sidebar-foreground">{bot()?.name}</Text>
          <If when={props.detailed}>
            <Text class="text-xs text-muted-foreground">{props.run.time}</Text>
          </If>
        </View>
        <View class="flex-row items-center gap-2">
          <Text class="flex-1 truncate text-sm text-muted-foreground">{props.run.summary}</Text>
          <If when={props.detailed}>
            <Text class={`text-xs ${STATUS_TONE[props.run.status]}`}>{STATUS_LABEL[props.run.status]}</Text>
          </If>
        </View>
      </View>
    </Button>
  );
}

function UnreadRow(props: { chatId: string }) {
  const chat = () => chatById(props.chatId);
  return (
    <Button
      accessibilityLabel={chat()?.title}
      onPress={() => openSpaceChat(props.chatId)}
      class="flex-row items-center gap-3 rounded-(--radius) px-3 py-2 hover:bg-sidebar-accent/60 active:bg-sidebar-accent"
    >
      <ChatAvatar bots={botsOfChat(props.chatId)} size={28} />
      <View class="min-w-0 flex-1 gap-0.5">
        <Text class="truncate font-medium text-sidebar-foreground">{chat()?.title}</Text>
        <Text class="truncate text-sm text-muted-foreground">{chat()?.preview}</Text>
      </View>
    </Button>
  );
}

/** The search field's filter toggle; a dot says filters apply. */
export function FilterToggle() {
  return (
    <View>
      <IconButton
        icon="sliders-horizontal"
        label="Filters"
        selected={filtersExpanded()}
        onPress={() => filtersExpanded.update((v) => !v)}
      />
      <If when={appliedFilterCount() > 0}>
        <View class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" accessibilityLabel="Filters apply" />
      </If>
    </View>
  );
}

const statusItems = [{ value: "all", title: "All statuses" }, ...STATUS_FILTERS.map((s) => ({ value: s, title: STATUS_LABEL[s] }))];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** The calendar draws nothing itself: each item's content, by kind. */
function CalendarItem(entry: CalendarEntry) {
  switch (entry.kind) {
    case "previous":
      return <Icon name="chevron-left" size={16} />;
    case "next":
      return <Icon name="chevron-right" size={16} />;
    case "weekday":
      return <Text class="text-xs text-muted-foreground">{WEEKDAYS[entry.value]}</Text>;
    case "monthToggle":
    case "month":
      return <Text class="text-sm font-medium text-popover-foreground">{MONTHS[entry.month - 1]}</Text>;
    default:
      return (
        <Text class="text-sm text-popover-foreground group-selected:text-primary-foreground group-data-outside:text-muted-foreground">
          {String(entry.value)}
        </Text>
      );
  }
}

/** A day picked from a calendar, kept as the filter's ISO `YYYY-MM-DD` string ("" when unset). */
function DateField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <DatePicker
      value={props.value || null}
      onChange={({ value }) => props.onChange(typeof value === "string" ? value : "")}
      accessibilityLabel={props.label}
      popupClass={`${popupClass} w-64 p-0`}
      calendarClass="gap-2 p-2"
      headerClass="flex-row items-center justify-between"
      rowClass="flex-row"
      itemClass="group h-8 min-w-8 items-center justify-center rounded-md px-1 hover:bg-accent selected:bg-primary data-today:border data-today:border-border disabled:opacity-40"
      renderItem={CalendarItem}
      previousAccessibilityLabel="Previous month"
      nextAccessibilityLabel="Next month"
      trigger={
        <View class={`${fieldClass} min-h-9 flex-row items-center justify-between gap-2`}>
          <Text class={`text-sm ${props.value ? "text-foreground" : "text-muted-foreground"}`}>{props.value || "Pick a date"}</Text>
          <Icon name="calendar" size={14} tone="muted-foreground" />
        </View>
      }
    />
  );
}

function FilterFields() {
  const filters = activityFilters;
  return (
    <View class="gap-2 px-3 pb-2">
      <Field label="Status">
        <Select
          items={statusItems}
          value={filters().status}
          onChange={({ value }) => value && filters.update((f) => ({ ...f, status: value as typeof f.status }))}
          accessibilityLabel="Status"
          popupClass={popupClass}
          itemClass="rounded-md px-3 py-2 text-popover-foreground focus:bg-accent selected:font-medium"
          trigger={
            <View class={`${fieldClass} flex-row items-center justify-between`}>
              <Text class="text-foreground">{statusItems.find((s) => s.value === filters().status)?.title}</Text>
              <Icon name="chevron-down" size={16} tone="muted-foreground" />
            </View>
          }
        />
      </Field>
      <View class="flex-row gap-2">
        <View class="min-w-0 flex-1">
          <Field label="From">
            <DateField label="From" value={filters().from} onChange={(from) => filters.update((f) => ({ ...f, from }))} />
          </Field>
        </View>
        <View class="min-w-0 flex-1">
          <Field label="To">
            <DateField label="To" value={filters().to} onChange={(to) => filters.update((f) => ({ ...f, to }))} />
          </Field>
        </View>
      </View>
    </View>
  );
}

function Chip(props: { label: string; onClear: () => void }) {
  return (
    <Button
      accessibilityLabel={`Clear ${props.label}`}
      onPress={props.onClear}
      class="flex-row items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 hover:bg-accent active:bg-accent"
    >
      <Text class="text-xs text-foreground">{props.label}</Text>
      <Icon name="x" size={12} tone="muted-foreground" />
    </Button>
  );
}

function FilterChips() {
  const f = applied;
  const clear = (field: Parameters<typeof clearFilter>[1]) => activityFilters.update((cur) => clearFilter(cur, field));
  return (
    <If when={appliedFilterCount() > 0}>
      <View class="flex-row flex-wrap items-center gap-1.5 px-3 pb-2">
        <If when={f().query}>
          <Chip label={`Search: ${f().query}`} onClear={() => clear("query")} />
        </If>
        <If when={f().status !== "all"}>
          <Chip label={STATUS_LABEL[f().status as Run["status"]]} onClear={() => clear("status")} />
        </If>
        <If when={f().from}>
          <Chip label={`From ${f().from}`} onClear={() => clear("from")} />
        </If>
        <If when={f().to}>
          <Chip label={`To ${f().to}`} onClear={() => clear("to")} />
        </If>
        <TextButton label="Reset all" variant="ghost" onPress={() => activityFilters.set(emptyFilters())} />
      </View>
    </If>
  );
}

export function ActivityList() {
  return (
    <Scroll class="flex-1" contentClass="px-2 pb-2">
      <If when={filtersExpanded()}>
        <FilterFields />
      </If>
      <FilterChips />
      <If when={activity().on && activity().hasRuns && !activity().anyMatch}>
        <Text class="px-3 py-2 text-sm text-muted-foreground">No runs match these filters.</Text>
      </If>
      <If when={!activity().hasRuns && activity().unread.length === 0}>
        <Text class="px-3 py-2 text-sm text-muted-foreground">No runs yet</Text>
      </If>
      <Section name="attention" label="Needs attention" count={activity().attention.length} defaultOpen>
        <Each of={activity().attention} key={(r) => r.id}>
          {(run) => <RunRow run={run()} detailed={false} />}
        </Each>
      </Section>
      <Section name="working" label="Working" count={activity().working.length} defaultOpen={false}>
        <Each of={activity().working} key={(r) => r.id}>
          {(run) => <RunRow run={run()} detailed={false} />}
        </Each>
      </Section>
      <Section name="unread" label="Unread" count={activity().unread.length} defaultOpen={false}>
        <Each of={activity().unread} key={(c) => c.id}>
          {(chat) => <UnreadRow chatId={chat().id} />}
        </Each>
      </Section>
      <Section name="recent" label="Recent" count={activity().recent.length} defaultOpen>
        <Each of={activity().recent} key={(r) => r.id}>
          {(run) => <RunRow run={run()} detailed />}
        </Each>
      </Section>
    </Scroll>
  );
}

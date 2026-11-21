// A bot's details: settings, routines, pages and computer, in tabs.
import { Scroll, Text, View } from "nsh";
import { AlertDialog, Button, Input, Select, Sheet, Tab, Tabs, TextView } from "nsh/base";
import { BotFace, Choices, Field, fieldClass, Icon, IconButton, popupClass, SectionTitle, SwitchRow, TextButton } from "../components/ui";
import { nav, type PanelTab, panelBotId, panelPageId, panelRoutineId, panelTab, roomy, wide } from "../nav";
import { SidePanel } from "./PanelResize";
import {
  addRoutine,
  type Bot,
  botById,
  type ComputerMode,
  models,
  pagesOf,
  removeRoutine,
  type Routine,
  routineById,
  routinesOf,
  runRoutine,
  updateBot,
  updateRoutine,
} from "../store";

const tabs: { value: PanelTab; label: string }[] = [
  { value: "settings", label: "Settings" },
  { value: "routines", label: "Routines" },
  { value: "pages", label: "Pages" },
  { value: "computer", label: "Computer" },
];

/** Back to a tab's list from one of its items. */
function BackTo(props: { label: string; onPress: () => void }) {
  return (
    <Button onPress={props.onPress} class="flex-row items-center gap-1 self-start rounded-full py-1 pe-3 hover:bg-accent">
      <Icon name="chevron-left" size={16} tone="muted-foreground" />
      <Text class="text-sm text-muted-foreground">{props.label}</Text>
    </Button>
  );
}

function SettingsTab(props: { bot: Bot }) {
  return (
    <View class="gap-5">
      <Field label="Name">
        <Input
          value={props.bot.name}
          onChange={({ value }) => value.trim() && updateBot(props.bot.id, { name: value })}
          class={fieldClass}
        />
      </Field>
      <Field label="Instructions">
        <Input
          value={props.bot.instructions}
          onChange={({ value }) => updateBot(props.bot.id, { instructions: value })}
          multiline
          placeholder="What this bot does and how"
          class={`${fieldClass} min-h-28 py-2`}
        />
      </Field>
      <Field label="Model">
        <Select
          items={models}
          value={props.bot.model}
          onChange={({ value }) => value && updateBot(props.bot.id, { model: value })}
          accessibilityLabel="Model"
          popupClass={popupClass}
          itemClass="rounded-md px-3 py-2 text-popover-foreground focus:bg-accent selected:font-medium"
          trigger={
            <View class={`${fieldClass} flex-row items-center justify-between`}>
              <Text class="text-foreground">{models.find((m) => m.value === props.bot.model)?.title}</Text>
              <Icon name="chevron-right" size={16} tone="muted-foreground" />
            </View>
          }
        />
      </Field>
      <SwitchRow
        label="Notify me when a task finishes"
        checked={props.bot.notifyOnFinish}
        onChange={(on) => updateBot(props.bot.id, { notifyOnFinish: on })}
      />
    </View>
  );
}

async function confirmDeleteRoutine(routine: Routine) {
  const { action } = await AlertDialog.show({
    title: `Delete "${routine.name}"?`,
    description: "It stops running. Past results stay in the chat.",
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Delete", role: "destructive", id: "delete" },
    ],
  });
  if (action !== "delete") return;
  removeRoutine(routine.id);
  panelRoutineId.set(null);
}

function RoutineEditor(props: { routine: Routine }) {
  const r = () => props.routine;
  return (
    <View class="gap-5">
      <BackTo label="Routines" onPress={() => panelRoutineId.set(null)} />
      <Field label="Name">
        <Input value={r().name} onChange={({ value }) => updateRoutine(r().id, { name: value })} class={fieldClass} />
      </Field>
      <Field label="Instruction">
        <Input
          value={r().instruction}
          onChange={({ value }) => updateRoutine(r().id, { instruction: value })}
          multiline
          placeholder="What to do each time it runs"
          class={`${fieldClass} min-h-24 py-2`}
        />
      </Field>
      <Field label="Schedule">
        <Input value={r().schedule} onChange={({ value }) => updateRoutine(r().id, { schedule: value })} class={fieldClass} />
      </Field>
      <SwitchRow label="Active" checked={r().active} onChange={(active) => updateRoutine(r().id, { active })} />
      <View class="gap-2">
        <SectionTitle>Recent runs</SectionTitle>
        <If when={r().runs.length > 0} else={<Text class="px-1 text-sm text-muted-foreground">Not run yet</Text>}>
          <Each of={r().runs} key={(run, i) => `${i}-${run}`}>
            {(run) => (
              <View class="flex-row items-center gap-2 px-1">
                <Icon name="check" size={14} tone="muted-foreground" />
                <Text class="text-sm text-foreground">{run()}</Text>
              </View>
            )}
          </Each>
        </If>
      </View>
      <View class="flex-row justify-between">
        <Button
          accessibilityLabel="Delete routine"
          onPress={() => void confirmDeleteRoutine(r())}
          class="flex-row items-center gap-2 rounded-full px-3 py-1.5 hover:bg-accent"
        >
          <Icon name="trash" size={16} tone="destructive" />
          <Text class="text-sm text-destructive">Delete…</Text>
        </Button>
        <TextButton label="Run now" onPress={() => runRoutine(r().id)} />
      </View>
    </View>
  );
}

function RoutineList(props: { bot: Bot }) {
  return (
    <View class="gap-2">
      <Each of={routinesOf(props.bot.id)} key={(r) => r.id}>
        {(r) => (
          <Button
            onPress={() => panelRoutineId.set(r().id)}
            class="flex-row items-center gap-3 rounded-(--radius) border border-border p-3 hover:bg-accent active:bg-accent"
          >
            <Icon name="clock" size={18} tone={r().active ? "foreground" : "muted-foreground"} />
            <View class="min-w-0 flex-1 gap-0.5">
              <Text class="truncate font-medium text-foreground">{r().name}</Text>
              <Text class="truncate text-sm text-muted-foreground">{r().active ? r().schedule : "Paused"}</Text>
            </View>
            <Icon name="chevron-right" size={16} tone="muted-foreground" />
          </Button>
        )}
      </Each>
      <If when={routinesOf(props.bot.id).length === 0}>
        <Text class="px-1 py-2 text-sm text-muted-foreground">No routines yet. A routine runs an instruction on a schedule.</Text>
      </If>
      <Button
        onPress={() => panelRoutineId.set(addRoutine(props.bot.id))}
        class="flex-row items-center justify-center gap-2 rounded-(--radius) border border-dashed border-border p-3 hover:bg-accent"
      >
        <Icon name="plus" size={16} tone="muted-foreground" />
        <Text class="text-sm text-muted-foreground">New routine</Text>
      </Button>
    </View>
  );
}

function RoutinesTab(props: { bot: Bot }) {
  return (
    <If when={routineById(panelRoutineId() ?? "")} else={<RoutineList bot={props.bot} />}>
      {(routine) => <RoutineEditor routine={routine()} />}
    </If>
  );
}

function PageView(props: { pageId: string; botId: string }) {
  const page = () => pagesOf(props.botId).find((p) => p.id === props.pageId);
  return (
    <View class="gap-4">
      <BackTo label="Pages" onPress={() => panelPageId.set(null)} />
      <View class="gap-1">
        <Text role="header" class="text-xl font-semibold text-foreground">
          {page()?.title}
        </Text>
        <Text class="text-sm text-muted-foreground">{`Updated ${page()?.updated ?? ""}`}</Text>
      </View>
      <TextView markdown={page()?.markdown ?? ""} selectable class="text-foreground" />
    </View>
  );
}

function PageList(props: { bot: Bot }) {
  return (
    <View class="gap-2">
      <Each of={pagesOf(props.bot.id)} key={(p) => p.id}>
        {(p) => (
          <Button
            onPress={() => panelPageId.set(p().id)}
            class="flex-row items-center gap-3 rounded-(--radius) border border-border p-3 hover:bg-accent active:bg-accent"
          >
            <Icon name="file-text" size={18} tone="muted-foreground" />
            <View class="min-w-0 flex-1 gap-0.5">
              <Text class="truncate font-medium text-foreground">{p().title}</Text>
              <Text class="text-sm text-muted-foreground">{`Updated ${p().updated}`}</Text>
            </View>
            <Icon name="chevron-right" size={16} tone="muted-foreground" />
          </Button>
        )}
      </Each>
      <If when={pagesOf(props.bot.id).length === 0}>
        <Text class="px-1 py-2 text-sm text-muted-foreground">No pages yet. Pages are documents this bot keeps up to date.</Text>
      </If>
    </View>
  );
}

function PagesTab(props: { bot: Bot }) {
  return (
    <If when={panelPageId()} else={<PageList bot={props.bot} />}>
      {(id) => <PageView pageId={id()} botId={props.bot.id} />}
    </If>
  );
}

const computerModes: { value: ComputerMode; label: string; description: string }[] = [
  { value: "team", label: "Shared", description: "Uses the team's computer, with the apps and files everyone sees." },
  { value: "private", label: "Private", description: "Gets a computer of its own that only this bot uses." },
  { value: "off", label: "Off", description: "No computer: chat and connected apps only." },
];

function ComputerTab(props: { bot: Bot }) {
  return (
    <View class="gap-3">
      <View class="flex-row items-center gap-2 px-1">
        <Icon name="monitor" size={18} tone="muted-foreground" />
        <Text class="text-sm text-muted-foreground">Where this bot runs commands and browses.</Text>
      </View>
      <Choices options={computerModes} value={props.bot.computer} onChange={(computer) => updateBot(props.bot.id, { computer })} />
    </View>
  );
}

/** The panel's content for one bot; `onClose` hides it (or pops the phone's page). */
export function BotDetails(props: { botId: string; onClose: () => void }) {
  return (
    <If when={botById(props.botId)}>
      {(bot) => (
        <View class="flex-1 bg-background">
          <View class="flex-row items-center gap-3 px-4 pt-3 pb-2">
            <If when={!wide()}>
              <IconButton icon="chevron-left" label="Back" onPress={props.onClose} />
            </If>
            <BotFace bot={bot()} size={32} />
            <Text role="header" class="flex-1 truncate text-lg font-semibold text-foreground">
              {bot().name}
            </Text>
            <If when={wide()}>
              <IconButton icon="x" label="Close" onPress={props.onClose} />
            </If>
          </View>
          <Tabs class="flex-row gap-1 border-b border-border px-3" indicatorClass="bottom-0 h-[2px] bg-foreground">
            <Each of={tabs} key={(t) => t.value}>
              {(t) => (
                <Tab
                  selected={panelTab() === t().value}
                  onPress={() => {
                    panelTab.set(t().value);
                    panelRoutineId.set(null);
                    panelPageId.set(null);
                  }}
                  class="group px-3 py-2.5"
                >
                  <Text class="text-sm text-muted-foreground group-selected:font-medium group-selected:text-foreground">{t().label}</Text>
                </Tab>
              )}
            </Each>
          </Tabs>
          <Scroll class="flex-1" contentClass="p-4">
            {(() => {
              switch (panelTab()) {
                case "settings":
                  return <SettingsTab bot={bot()} />;
                case "routines":
                  return <RoutinesTab bot={bot()} />;
                case "pages":
                  return <PagesTab bot={bot()} />;
                case "computer":
                  return <ComputerTab bot={bot()} />;
              }
            })()}
          </Scroll>
        </View>
      )}
    </If>
  );
}

const closePanel = () => panelBotId.set(null);

/** The panel beside the chat on roomy windows. */
export function BotPanelSide() {
  return (
    <If when={roomy() ? panelBotId() : null}>
      {(id) => (
        <SidePanel>
          <BotDetails botId={id()} onClose={closePanel} />
        </SidePanel>
      )}
    </If>
  );
}

/** The panel as a sheet on wide windows too narrow to keep it beside the chat. */
export function BotPanelSheet() {
  return (
    <Sheet
      open={wide() && !roomy() && panelBotId() !== null}
      onOpenChange={({ open }) => !open && closePanel()}
      side="right"
      backdropClass="bg-overlay"
      popupClass="h-full w-96 max-w-full border-l border-border bg-background pt-[env(safe-area-inset-top)]"
    >
      <If when={panelBotId()}>{(id) => <BotDetails botId={id()} onClose={closePanel} />}</If>
    </Sheet>
  );
}

/** The phone's page for a bot. */
export function BotPage(props: { botId: string }) {
  return (
    <BotDetails
      botId={props.botId}
      onClose={() => {
        closePanel();
        nav.pop();
      }}
    />
  );
}

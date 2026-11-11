// Settings take over the window. Wide windows: the sections in a sidebar beside the one shown.
// Phones: the sections as a list, each pushed as a page of the settings stack.
import { type JSX, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Button, Dialog, Input, NavPage, NavStack } from "nsh/base";
import { SelectField, Segmented, SettingsGroup, SettingsRow, SwitchSetting } from "../components/settings";
import { AccountAvatar, fieldClass, Icon, IconButton, type IconName, NavRow, TextButton } from "../components/ui";
import { type SettingsSection, settingsNav, settingsOpen, sidebarDensity, wide } from "../nav";
import {
  activeOrganization,
  allOrganizations,
  type Appearance,
  appVersion,
  currentAccount,
  currentAppearance,
  currentPreferences,
  deleteOrganization,
  renameOrganization,
  setAppearance,
  setPreference,
} from "../store";
import { ApprovalsSettings } from "./settings/Approvals";
import { ComputerSettings } from "./settings/Computer";
import { MemorySettings } from "./settings/Memory";
import { ModelsSettings } from "./settings/Models";
import { UsageSettings } from "./settings/Usage";
import { VaultSettings } from "./settings/Vault";
import { VoiceSettings } from "./settings/Voice";

/** The sections in nav order, with the line under a page's title where the name alone doesn't say what it is for. */
const sections: { id: SettingsSection; label: string; icon: IconName; description?: string }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "organization", label: "Organization", icon: "building-2" },
  { id: "models", label: "Models", icon: "cpu", description: "Which LLMs your bots use." },
  { id: "voice", label: "Voice", icon: "volume-2", description: "Calls, dictation, and replies read aloud." },
  { id: "approvals", label: "Approvals", icon: "shield-check", description: "When bots check with you before acting." },
  { id: "vault", label: "Vault", icon: "key-round", description: "Logins and keys your bots can use." },
  { id: "memory", label: "Memory", icon: "brain", description: "What your bots remember between chats." },
  { id: "usage", label: "Usage", icon: "gauge" },
  { id: "computer", label: "Computer", icon: "monitor" },
  { id: "updates", label: "Updates", icon: "cloud-download" },
];
const sectionOf = (id: SettingsSection) => sections.find((s) => s.id === id)!;

/** The section shown: the stack's top, General while at its root (wide windows show a page there). */
const shown = (): SettingsSection => {
  const top = settingsNav.routes().at(-1)!;
  return top.name === "root" ? "general" : top.name;
};
const show = (id: SettingsSection) => settingsNav.setRoutes([{ name: "root" }, { name: id }]);
const close = () => settingsOpen.set(false);

async function confirm(title: string, description: string, verb: string) {
  const { action } = await AlertDialog.show({
    title,
    description,
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: verb, role: "destructive", id: "yes" },
    ],
  });
  return action === "yes";
}

/** Import and export need the server, which this build does not talk to. */
const needsServer = (title: string) =>
  void AlertDialog.show({
    title,
    description: "This needs the server, which this preview doesn't connect to.",
    actions: [{ label: "OK", role: "cancel", id: "ok" }],
  });

const appearances: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const languages = [
  { value: "en", title: "English" },
  { value: "de", title: "Deutsch" },
  { value: "es", title: "Español" },
  { value: "fr", title: "Français" },
  { value: "ja", title: "日本語" },
  { value: "zh-CN", title: "简体中文" },
];
const timezones = ["America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"].map(
  (tz) => ({
    value: tz,
    title: tz.replace("_", " "),
  }),
);

function Account() {
  return (
    <SettingsGroup title="Account">
      <SettingsRow first label={currentAccount().name} detail={currentAccount().email} />
    </SettingsGroup>
  );
}

function General() {
  const p = currentPreferences;
  return (
    <>
      <Account />
      <SettingsGroup title="Preferences">
        <SettingsRow
          first
          label="Appearance"
          control={<Segmented options={appearances} value={currentAppearance()} onChange={setAppearance} />}
        />
        <SettingsRow
          label="Bot style"
          control={
            <Segmented
              options={[
                { value: "original", label: "Original" },
                { value: "pairidaeza", label: "Pairidaeza" },
              ]}
              value={p().botStyle}
              onChange={(v) => setPreference("botStyle", v)}
            />
          }
        />
        <SettingsRow
          label="Sidebar density"
          control={
            <Segmented
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              value={sidebarDensity()}
              onChange={(v) => sidebarDensity.set(v)}
            />
          }
        />
        <SettingsRow
          label="Language"
          control={<SelectField label="Language" items={languages} value={p().language} onChange={(v) => setPreference("language", v)} />}
        />
        <SettingsRow
          label="Timezone"
          control={
            <SelectField
              label="Timezone"
              searchable
              items={timezones}
              value={p().timezone}
              onChange={(v) => setPreference("timezone", v)}
            />
          }
        />
      </SettingsGroup>
      <SettingsGroup title="Chat">
        <SwitchSetting first label="Send with Enter" checked={p().sendWithEnter} onChange={(on) => setPreference("sendWithEnter", on)} />
        <SwitchSetting label="Stream replies" checked={p().streamReplies} onChange={(on) => setPreference("streamReplies", on)} />
        <SwitchSetting label="Show tool activity" checked={p().showToolActivity} onChange={(on) => setPreference("showToolActivity", on)} />
        <SwitchSetting
          label="Load web images automatically"
          checked={p().loadWebImages}
          onChange={(on) => setPreference("loadWebImages", on)}
        />
      </SettingsGroup>
      <SettingsGroup title="Computers">
        <SwitchSetting
          first
          label="Let bots use this computer"
          checked={p().letBotsUseComputer}
          onChange={(on) => setPreference("letBotsUseComputer", on)}
        />
      </SettingsGroup>
      <SettingsGroup title="Data">
        <SettingsRow
          first
          label="Your data"
          control={
            <>
              <TextButton label="Export data" variant="ghost" onPress={() => needsServer("Export data")} />
              <TextButton label="Import data" variant="ghost" onPress={() => needsServer("Import data")} />
            </>
          }
        />
        <SettingsRow
          label="Agent from another app"
          control={<TextButton label="Import an agent" variant="ghost" onPress={() => needsServer("Import an agent")} />}
        />
      </SettingsGroup>
    </>
  );
}

function Organization() {
  const org = () => allOrganizations().find((o) => o.id === activeOrganization())!;
  const only = () => allOrganizations().length < 2;
  return (
    <>
      <SettingsGroup title="Organization">
        <SettingsRow
          first
          label="Name"
          control={
            <Input
              value={org().name}
              onChange={({ value }) => value.trim() && renameOrganization(org().id, value)}
              maxLength={80}
              accessibilityLabel="Organization name"
              class={`${fieldClass} w-56`}
            />
          }
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          first
          label="Delete organization"
          detail={only() ? "Your only organization can't be deleted." : "This cannot be undone."}
          control={
            <Button
              accessibilityLabel="Delete organization"
              disabled={only()}
              onPress={async () =>
                (await confirm(`Delete ${org().name}?`, "This cannot be undone.", "Delete")) && deleteOrganization(org().id)
              }
              class="min-h-8 items-center justify-center rounded-full px-4 py-1.5 hover:bg-accent active:bg-accent disabled:opacity-40"
            >
              <Text class="text-sm font-medium text-destructive">Delete</Text>
            </Button>
          }
        />
      </SettingsGroup>
    </>
  );
}

function Updates() {
  const checked = signal(false);
  return (
    <SettingsGroup title="Pairidaeza">
      <SettingsRow
        first
        label={`Version ${appVersion}`}
        detail={checked() ? "You're up to date." : undefined}
        control={<TextButton label="Check for updates" variant="ghost" onPress={() => checked.set(true)} />}
      />
      <SwitchSetting
        label="Install updates automatically"
        checked={currentPreferences().autoUpdate}
        onChange={(on) => setPreference("autoUpdate", on)}
      />
    </SettingsGroup>
  );
}

const pages: Record<SettingsSection, () => JSX.Element> = {
  general: General,
  organization: Organization,
  models: ModelsSettings,
  voice: VoiceSettings,
  approvals: ApprovalsSettings,
  vault: VaultSettings,
  memory: MemorySettings,
  usage: UsageSettings,
  computer: ComputerSettings,
  updates: Updates,
};

function Body(props: { id: SettingsSection }) {
  const Page = pages[props.id];
  return (
    <View class="w-full max-w-2xl gap-8">
      <Page />
    </View>
  );
}

/** Wide windows: the sections down the side, the shown one's title, its line and the close button above it. */
function Wide() {
  const section = () => sectionOf(shown());
  return (
    <View class="flex-1 flex-row">
      <View class="w-60 gap-1 border-e border-sidebar-border bg-sidebar px-3 pt-4 pb-4" role="navigation" accessibilityLabel="Settings">
        <View class="flex-row items-center gap-2 pb-3">
          <IconButton icon="chevron-left" label="Back to workspace" onPress={close} />
          <Text role="header" class="text-lg font-semibold text-sidebar-foreground">
            Settings
          </Text>
        </View>
        <Each of={sections} key={(s) => s.id}>
          {(s) => (
            <Button
              accessibilityLabel={s().label}
              selected={shown() === s().id}
              onPress={() => show(s().id)}
              class="group min-h-9 flex-row items-center gap-2.5 rounded-lg px-2.5 hover:bg-sidebar-accent selected:bg-sidebar-accent"
            >
              <Icon name={s().icon} size={16} tone={shown() === s().id ? "sidebar-accent-foreground" : "sidebar-foreground"} />
              <Text class="text-sidebar-foreground group-hover:text-sidebar-accent-foreground group-selected:font-medium group-selected:text-sidebar-accent-foreground">
                {s().label}
              </Text>
            </Button>
          )}
        </Each>
      </View>
      <View class="min-w-0 flex-1">
        <View class="flex-row items-start gap-4 border-b border-border px-8 pt-4 pb-5">
          <View class="min-w-0 flex-1 gap-1">
            <Text role="header" class="text-xl font-medium text-foreground">
              {section().label}
            </Text>
            <If when={section().description}>{(d) => <Text class="text-muted-foreground">{d()}</Text>}</If>
          </View>
          <IconButton icon="x" label="Close settings" onPress={close} />
        </View>
        <Each of={[shown()]} key={(id) => id}>
          {(id) => (
            <Scroll class="flex-1" contentClass="px-8 py-6">
              <Body id={id()} />
            </Scroll>
          )}
        </Each>
      </View>
    </View>
  );
}

/** The header desktops and the web draw on phone-sized windows; iOS and Android show the system's from `title`. */
function Header(props: { title: string }) {
  return (
    <View class="h-14 flex-row items-center gap-2 border-b border-border px-3">
      <View class="w-9">
        <If when={settingsNav.routes().length > 1} else={<IconButton icon="chevron-left" label="Back to workspace" onPress={close} />}>
          <IconButton icon="chevron-left" label="Back" onPress={() => settingsNav.pop()} />
        </If>
      </View>
      <Text role="header" class="flex-1 text-center font-semibold text-foreground">
        {props.title}
      </Text>
      <IconButton icon="x" label="Close settings" onPress={close} />
    </View>
  );
}

function Page(props: { title: string; children: JSX.Element }) {
  return (
    <NavPage title={props.title} header={<Header title={props.title} />} class="bg-background">
      <Scroll class="flex-1" contentClass="gap-6 p-4 pb-[env(safe-area-inset-bottom)]">
        {props.children}
      </Scroll>
    </NavPage>
  );
}

function Root() {
  return (
    <Page title="Settings">
      <View class="flex-row items-center gap-3 px-1">
        <AccountAvatar name={currentAccount().name} size={44} />
        <View class="flex-1 gap-0.5">
          <Text class="font-medium text-foreground">{currentAccount().name}</Text>
          <Text class="text-sm text-muted-foreground">{currentAccount().email}</Text>
        </View>
      </View>
      <View class="gap-1">
        <Each of={sections} key={(s) => s.id}>
          {(s) => <NavRow icon={s().icon} label={s().label} onPress={() => settingsNav.push({ name: s().id })} />}
        </Each>
      </View>
    </Page>
  );
}

/** Phones: the list, each section pushed as a page with a way back. */
function Narrow() {
  return (
    <NavStack state={settingsNav} class="flex-1">
      {(route) => {
        if (route.name === "root") return <Root />;
        const section = sectionOf(route.name);
        return (
          <Page title={section.label}>
            <If when={section.description}>{(d) => <Text class="px-1 text-sm text-muted-foreground">{d()}</Text>}</If>
            <Body id={section.id} />
          </Page>
        );
      }}
    </NavStack>
  );
}

export function SettingsModal() {
  return (
    <Dialog
      open={settingsOpen()}
      onOpenChange={({ open }) => settingsOpen.set(open)}
      animation="fade"
      presentation="fullScreen"
      class="flex-1 bg-background"
      testID="settings"
    >
      <If when={wide()} else={<Narrow />}>
        <Wide />
      </If>
    </Dialog>
  );
}

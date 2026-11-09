// Settings: a modal with its own navigation stack, a list of sections, each section a page.
// A page sheet on iOS; on wider windows a panel at the right edge.
import { type JSX, Scroll, Text, View } from "nsh";
import { Dialog, Input, NavPage, NavStack } from "nsh/base";
import { AccountAvatar, Choices, Field, fieldClass, IconButton, NavRow, SectionTitle, SwitchRow } from "../components/ui";
import { settingsNav, settingsOpen, type SettingsRoute, sidebarDensity, wide } from "../nav";
import {
  allApps,
  type ApprovalMode,
  type Appearance,
  currentAccount,
  currentAppearance,
  currentApprovalMode,
  currentDefaultModel,
  models,
  renameAccount,
  setAppConnected,
  setAppearance,
  setApprovalMode,
  setDefaultModel,
} from "../store";

const approvalModes: { value: ApprovalMode; label: string; description: string }[] = [
  { value: "never", label: "Never ask", description: "Runs every action without waiting." },
  { value: "auto", label: "Auto", description: "Asks only when an action is off-task or can't be undone." },
  { value: "ask", label: "Ask", description: "Asks before any action that changes something." },
];

const appearances: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const densities = [
  { value: "comfortable" as const, label: "Comfortable", description: "Shows previews and times." },
  { value: "compact" as const, label: "Compact", description: "Shows a status line only." },
];
const close = () => settingsOpen.set(false);

/** The header desktops and the web draw; iOS and Android show the system's from `title`. */
function Header(props: { title: string }) {
  return (
    <View class="h-14 flex-row items-center gap-2 border-b border-border px-3">
      <View class="w-9">
        <If when={settingsNav.routes().length > 1}>
          <IconButton icon="chevron-left" label="Back" onPress={() => settingsNav.pop()} />
        </If>
      </View>
      <Text role="header" class="flex-1 text-center font-semibold text-popover-foreground">
        {props.title}
      </Text>
      <IconButton icon="x" label="Close settings" onPress={close} />
    </View>
  );
}

function Page(props: { title: string; children: JSX.Element }) {
  return (
    <NavPage title={props.title} header={<Header title={props.title} />} class="bg-popover">
      <Scroll class="flex-1" contentClass="gap-6 p-4 pb-[env(safe-area-inset-bottom)]">
        {props.children}
      </Scroll>
    </NavPage>
  );
}

function Root() {
  const label = (list: { value: string; label?: string; title?: string }[], value: string) => {
    const found = list.find((o) => o.value === value);
    return found?.label ?? found?.title ?? "";
  };
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
        <NavRow
          icon="sun-moon"
          label="General"
          value={label(appearances, currentAppearance())}
          onPress={() => settingsNav.push({ name: "general" })}
        />
        <NavRow
          icon="shield-check"
          label="Approvals"
          value={label(approvalModes, currentApprovalMode())}
          onPress={() => settingsNav.push({ name: "approvals" })}
        />
        <NavRow
          icon="sparkles"
          label="Models"
          value={label(models, currentDefaultModel())}
          onPress={() => settingsNav.push({ name: "models" })}
        />
        <NavRow
          icon="plug"
          label="Connected apps"
          value={`${allApps().filter((a) => a.connected).length} connected`}
          onPress={() => settingsNav.push({ name: "apps" })}
        />
      </View>
    </Page>
  );
}

function General() {
  return (
    <Page title="General">
      <Field label="Name">
        <Input value={currentAccount().name} onChange={({ value }) => value.trim() && renameAccount(value)} class={fieldClass} />
      </Field>
      <View class="gap-2">
        <SectionTitle>Appearance</SectionTitle>
        <Choices options={appearances} value={currentAppearance()} onChange={setAppearance} />
      </View>
      <View class="gap-2">
        <SectionTitle>Sidebar density</SectionTitle>
        <Choices options={densities} value={sidebarDensity()} onChange={(v) => sidebarDensity.set(v)} />
      </View>
    </Page>
  );
}

function Approvals() {
  return (
    <Page title="Approvals">
      <Text class="px-1 text-sm text-muted-foreground">When bots stop to ask before acting. Every space follows this.</Text>
      <Choices options={approvalModes} value={currentApprovalMode()} onChange={setApprovalMode} />
    </Page>
  );
}

function Models() {
  return (
    <Page title="Models">
      <Text class="px-1 text-sm text-muted-foreground">Bots set to "Account default" run on this model.</Text>
      <Choices
        options={models.filter((m) => m.value !== "default").map((m) => ({ value: m.value, label: m.title }))}
        value={currentDefaultModel()}
        onChange={setDefaultModel}
      />
    </Page>
  );
}

function Apps() {
  return (
    <Page title="Connected apps">
      <Text class="px-1 text-sm text-muted-foreground">Bots can read and act in connected apps, within your approval mode.</Text>
      <View class="gap-4">
        <Each of={allApps()} key={(a) => a.id}>
          {(app) => <SwitchRow label={app().name} checked={app().connected} onChange={(on) => setAppConnected(app().id, on)} />}
        </Each>
      </View>
    </Page>
  );
}

function route(r: SettingsRoute) {
  switch (r.name) {
    case "root":
      return <Root />;
    case "general":
      return <General />;
    case "approvals":
      return <Approvals />;
    case "models":
      return <Models />;
    case "apps":
      return <Apps />;
  }
}

export function SettingsModal() {
  return (
    <Dialog
      open={settingsOpen()}
      onOpenChange={({ open }) => settingsOpen.set(open)}
      presentation="pageSheet"
      backdropClass="bg-overlay"
      class={wide() ? "ms-auto h-full w-full max-w-md overflow-hidden border-l border-border bg-popover shadow-lg" : "flex-1 bg-popover"}
      testID="settings"
    >
      <NavStack state={settingsNav} class="flex-1">
        {route}
      </NavStack>
    </Dialog>
  );
}

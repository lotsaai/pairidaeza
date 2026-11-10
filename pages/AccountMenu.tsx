// The sidebar footer: the account's face and name, a Connect apps pill, and the account menu that opens upward.
import { openUrl, safeAreaInsets, Text, View } from "nsh";
import { Button } from "nsh/base";
import { AccountAvatar, AppMenu, Icon, MenuDivider, MenuRow } from "../components/ui";
import { integrationsOpen, inviteOpen, mobileAppOpen, openArtifacts, openSettings, skillsOpen } from "../nav";
import { activeOrganization, allOrganizations, currentAccount, docsUrl, signOut, switchOrganization } from "../store";
import { connectedCount } from "./integrations/catalog";

export function AccountMenu(props: { mini: boolean }) {
  const insets = safeAreaInsets();
  return (
    <View
      class={
        props.mini
          ? "items-center gap-2 border-t border-sidebar-border px-1 pt-2"
          : "flex-row items-center gap-2 border-t border-sidebar-border px-2 pt-2"
      }
      style={{ paddingBottom: Math.max(insets().bottom, 8) }}
    >
      <AppMenu
        align="start"
        trigger={
          <View
            role="button"
            accessibilityLabel="Account"
            class={
              props.mini
                ? "rounded-full p-1 hover:bg-sidebar-accent/60"
                : "min-w-0 flex-1 flex-row items-center gap-2.5 rounded-(--radius) px-2 py-1.5 hover:bg-sidebar-accent/60"
            }
          >
            <AccountAvatar name={currentAccount().name} size={props.mini ? 32 : 28} />
            <If when={!props.mini}>
              <View class="min-w-0 flex-1">
                <Text class="truncate text-sm font-medium text-sidebar-foreground">{currentAccount().name}</Text>
                <Text class="truncate text-xs text-muted-foreground">{`${connectedCount()} apps connected`}</Text>
              </View>
            </If>
          </View>
        }
      >
        <View class="gap-0.5 px-2.5 py-1.5">
          <Text class="truncate text-sm font-medium text-popover-foreground">{currentAccount().name}</Text>
          <If when={currentAccount().email !== currentAccount().name}>
            <Text class="truncate text-xs text-muted-foreground">{currentAccount().email}</Text>
          </If>
        </View>
        <MenuDivider />
        <If when={allOrganizations().length > 1}>
          <Each of={allOrganizations()} key={(o) => o.id}>
            {(org) => (
              <MenuRow
                icon={activeOrganization() === org().id ? "check" : "users"}
                label={org().name}
                onSelect={() => switchOrganization(org().id)}
              />
            )}
          </Each>
          <MenuDivider />
        </If>
        <If when={props.mini}>
          <MenuRow icon="plug" label="Connect apps" onSelect={() => integrationsOpen.set(true)} />
        </If>
        <MenuRow icon="settings" label="Settings" onSelect={() => openSettings()} />
        <MenuRow icon="scroll-text" label="Skills" onSelect={() => skillsOpen.set(true)} />
        <MenuRow icon="folder-open" label="Artifacts" onSelect={openArtifacts} />
        <MenuDivider />
        <MenuRow icon="smartphone" label="Get the mobile app" onSelect={() => mobileAppOpen.set(true)} />
        <MenuRow icon="user-plus" label="Invite friends" onSelect={() => inviteOpen.set(true)} />
        <MenuRow icon="book-open" label="Docs" onSelect={() => void openUrl(docsUrl)} />
        <MenuDivider />
        <MenuRow icon="log-out" label="Log out" onSelect={signOut} />
      </AppMenu>
      <If when={!props.mini}>
        <Button
          onPress={() => integrationsOpen.set(true)}
          class="min-h-9 min-w-0 flex-1 flex-row items-center justify-between gap-2 rounded-full border border-border bg-sidebar-accent px-4 hover:bg-sidebar-accent/70 active:bg-sidebar-accent/70"
        >
          <Text class="truncate text-sm font-medium text-sidebar-accent-foreground">Connect apps</Text>
          <Icon name="plug" size={16} tone="sidebar-accent-foreground" />
        </Button>
      </If>
    </View>
  );
}

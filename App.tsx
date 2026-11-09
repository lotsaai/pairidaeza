// The shell: sidebar beside the chat on wide windows, a navigation stack on phones.
import { mount, View } from "nsh";
import { NavPage, NavStack } from "nsh/base";
import { mainView, nav, selectedChatId, sidebarShownWidth, wide } from "./nav";
import { SidebarResizeHandle } from "./pages/sidebar/resize";
import { BotPage, BotPanelSheet, BotPanelSide } from "./pages/BotPanel";
import { ChatList } from "./pages/ChatList";
import { ChatView } from "./pages/ChatView";
import { NewBotDialog } from "./pages/NewBot";
import { SearchPalette } from "./pages/Search";
import { SectionDialog } from "./pages/SectionDialog";
import { NewGroupPage, NewGroupPanelSheet, NewGroupPanelSide } from "./pages/NewGroup";
import { NewSpaceDialog } from "./pages/NewSpace";
import { SpaceSettingsDialog } from "./pages/SpaceSettings";
import { SettingsModal } from "./pages/Settings";
import { botById, chatById, isSignedIn } from "./store";
import { InviteDialog, MobileAppDialog } from "./pages/AccountDialogs";
import { ArtifactsPage } from "./pages/Artifacts";
import { SignedOut } from "./pages/SignedOut";
import { SkillsDialog } from "./pages/Skills";
import { IntegrationsModal } from "./pages/Integrations";

function App() {
  return (
    <View class="flex-1 bg-background">
      <If
        when={wide()}
        else={
          <NavStack state={nav} class="flex-1">
            {(route) => {
              switch (route.name) {
                case "chats":
                  return (
                    <NavPage title="Chats" headerVisible={false}>
                      <ChatList />
                    </NavPage>
                  );
                case "chat":
                  return (
                    <NavPage title={chatById(route.id)?.title ?? ""} headerVisible={false}>
                      <ChatView chatId={route.id} />
                    </NavPage>
                  );
                case "bot":
                  return (
                    <NavPage title={botById(route.id)?.name ?? ""} headerVisible={false}>
                      <BotPage botId={route.id} />
                    </NavPage>
                  );
                case "new-group":
                  return (
                    <NavPage title="New group" headerVisible={false}>
                      <NewGroupPage />
                    </NavPage>
                  );
                case "artifacts":
                  return (
                    <NavPage title="Artifacts" headerVisible={false}>
                      <ArtifactsPage />
                    </NavPage>
                  );
              }
            }}
          </NavStack>
        }
      >
        <View class="flex-1 flex-row pt-[env(safe-area-inset-top)]">
          <View class="border-r border-sidebar-border" style={{ width: sidebarShownWidth() }}>
            <ChatList />
            <SidebarResizeHandle />
          </View>
          <View class="min-w-0 flex-1">
            <If
              when={mainView() === "artifacts"}
              else={
                // Keyed by chat, so switching chats starts a fresh transcript and draft.
                <Each of={[selectedChatId()]} key={(id) => id}>
                  {(id) => <ChatView chatId={id()} />}
                </Each>
              }
            >
              <ArtifactsPage />
            </If>
          </View>
          <NewGroupPanelSide />
          <BotPanelSide />
        </View>
      </If>
      <BotPanelSheet />
      <SettingsModal />
      <SearchPalette />
      <NewBotDialog />
      <SectionDialog />
      <NewSpaceDialog />
      <SpaceSettingsDialog />
      <NewGroupPanelSheet />
      <SkillsDialog />
      <IntegrationsModal />
      <InviteDialog />
      <MobileAppDialog />
      <If when={!isSignedIn()}>
        <View class="absolute inset-0">
          <SignedOut />
        </View>
      </If>
    </View>
  );
}

mount(App);

// One chat: its header floating over the transcript, and the composer.
import { type ListRef, List, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { userBubbleColors } from "../components/colors";
import { ChatAvatar, Icon, IconButton } from "../components/ui";
import { nav, openBotDetails, wide } from "../nav";
import { type Bot, botById, chatById, currentPreferences, messagesFor } from "../store";
import { Composer } from "./chat/composer";
import { Row } from "./chat/message";

function ChatHeader(props: { chatId: string }) {
  const chat = () => chatById(props.chatId);
  return (
    <View class="absolute inset-x-0 top-0 flex-row items-center gap-2 px-3 py-[13px]" style={{ pointerEvents: "box-none" }}>
      <View class="flex-1 flex-row">
        <If when={!wide()}>
          <IconButton icon="chevron-left" label="Back" floating onPress={() => nav.pop()} />
        </If>
      </View>
      <Button
        accessibilityLabel={`${chat()?.title ?? ""} details`}
        onPress={() => chat() && openBotDetails(chat()!.botIds[0])}
        class="flex-row items-center gap-2 rounded-full bg-card py-1 ps-1 pe-3.5 hover:bg-accent active:bg-accent"
      >
        <ChatAvatar bots={(chat()?.botIds ?? []).map((id) => botById(id) as Bot)} size={26} />
        <Text class="font-medium text-foreground">{chat()?.title}</Text>
      </Button>
      <View class="flex-1" />
    </View>
  );
}

export function ChatView(props: { chatId: string }) {
  let list: ListRef | undefined;
  const atEnd = signal(true);
  const group = () => (chatById(props.chatId)?.botIds.length ?? 0) > 1;
  // A one-bot chat's user messages wear the bot's color; a group's stay neutral.
  const bubble = () => {
    const chat = chatById(props.chatId);
    const bot = chat?.botIds.length === 1 ? botById(chat.botIds[0]) : undefined;
    return bot ? userBubbleColors(bot.color) : undefined;
  };
  const shown = () => messagesFor(props.chatId).filter((m) => m.kind !== "tool" || currentPreferences().showToolActivity);
  return (
    <View class="flex-1 bg-background">
      <View class="flex-1">
        <List
          ref={(node: ListRef) => (list = node)}
          each={shown()}
          keyExtractor={(m) => m.id}
          estimatedItemSize={96}
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 40 }}
          onScroll={(e) => atEnd.set(e.offset.y + e.size.height >= e.contentSize.height - 40)}
          class="flex-1"
          contentClass={`pt-20 pb-6 ${wide() ? "px-7" : "px-4"}`}
        >
          {(message) => (
            // Keyed by id: a reused cell rebuilds for its new message instead of keeping the old one's kind.
            <Each of={[message()]} key={(m) => m.id}>
              {(m) => <Row chatId={props.chatId} message={m()} group={group()} bubble={bubble()} />}
            </Each>
          )}
        </List>
        <ChatHeader chatId={props.chatId} />
        <If when={!atEnd()}>
          <View class="absolute inset-x-0 bottom-3 items-center" style={{ pointerEvents: "box-none" }}>
            <Button
              accessibilityLabel="Jump to latest"
              onPress={() => list?.scrollToEnd({ animated: true })}
              class="size-10 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-accent"
            >
              <Icon name="arrow-down" size={17} />
            </Button>
          </View>
        </If>
      </View>
      <Composer chatId={props.chatId} bubble={bubble()} />
    </View>
  );
}

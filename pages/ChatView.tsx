// One chat: its header, the transcript and the composer.
import { Clipboard, type JSX, List, safeAreaInsets, signal, Text, View } from "nsh";
import { Button, Input, TextView } from "nsh/base";
import { AppContextMenu, AppMenu, BotFace, ChatAvatar, Icon, IconButton, MenuRow, TextButton } from "../components/ui";
import { nav, openBotDetails, wide } from "../nav";
import { answerApproval, type Bot, botById, chatById, type Message, messagesFor, sendMessage } from "../store";
import { ChatActions } from "./chatActions";

/** Each chat's unsent text, kept while the user looks elsewhere; Reply writes into it. */
const drafts = signal<Record<string, string>>({});
const draftOf = (chatId: string) => drafts()[chatId] ?? "";
const setDraft = (chatId: string, text: string) => drafts.update((all) => ({ ...all, [chatId]: text }));

/** Quotes a message into the composer. */
function reply(chatId: string, text: string) {
  const quote = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  setDraft(chatId, `${quote}\n\n${draftOf(chatId)}`);
}

/** Copy and Reply on a message: a right click on desktops, a held finger on phones. */
function MessageMenu(props: { chatId: string; text: string; children: JSX.Element }) {
  return (
    <AppContextMenu trigger={props.children}>
      <MenuRow icon="reply" label="Reply" onSelect={() => reply(props.chatId, props.text)} />
      <MenuRow icon="copy" label="Copy" onSelect={() => void Clipboard.writeText(props.text)} />
    </AppContextMenu>
  );
}

type Of<K extends Message["kind"]> = Extract<Message, { kind: K }>;

function ChatHeader(props: { chatId: string }) {
  const chat = () => chatById(props.chatId);
  return (
    <View class="flex-row items-center px-3 pt-3 pb-2">
      <View class="w-12">
        <If when={!wide()}>
          <IconButton icon="chevron-left" label="Back" onPress={() => nav.pop()} />
        </If>
      </View>
      <View class="flex-1 items-center">
        <Button
          accessibilityLabel={`${chat()?.title ?? ""} details`}
          onPress={() => chat() && openBotDetails(chat()!.botIds[0])}
          class="flex-row items-center gap-2 rounded-full bg-card py-1.5 ps-2 pe-4 hover:bg-accent active:bg-accent"
        >
          <ChatAvatar bots={(chat()?.botIds ?? []).map((id) => botById(id) as Bot)} size={24} />
          <Text class="font-medium text-foreground">{chat()?.title}</Text>
        </Button>
      </View>
      <View class="w-12 items-end">
        <AppMenu align="end" trigger={<IconButton icon="ellipsis" label="Chat options" />}>
          <ChatActions chatId={props.chatId} details />
        </AppMenu>
      </View>
    </View>
  );
}

function BotName(props: { botId: string }) {
  const bot = () => botById(props.botId) as Bot;
  return (
    <View class="flex-row items-center gap-2">
      <BotFace bot={bot()} size={18} />
      <Text class="text-sm font-medium" style={{ color: bot().color }}>
        {bot().name}
      </Text>
    </View>
  );
}

function Row(props: { chatId: string; message: Message }) {
  return (
    <View class="items-center px-4 py-1.5">
      <View class="w-full max-w-3xl">
        {(() => {
          const m = props.message;
          switch (m.kind) {
            case "date":
              return <Text class="self-center py-2 text-xs text-muted-foreground">{m.label}</Text>;
            case "user":
              return (
                <MessageMenu chatId={props.chatId} text={m.text}>
                  <View class="max-w-[85%] self-end rounded-3xl bg-chat-user px-4 py-2.5">
                    <Text class="text-chat-user-foreground">{m.text}</Text>
                  </View>
                </MessageMenu>
              );
            case "bot":
              return (
                <View class="w-full max-w-2xl gap-2">
                  <BotName botId={m.botId} />
                  <MessageMenu chatId={props.chatId} text={m.markdown}>
                    <View class="self-stretch rounded-3xl bg-card px-4 py-1">
                      <TextView markdown={m.markdown} selectable class="text-card-foreground" />
                    </View>
                  </MessageMenu>
                </View>
              );
            case "tool":
              return <ToolRow message={m} />;
            case "approval":
              return <ApprovalCard chatId={props.chatId} message={m} />;
          }
        })()}
      </View>
    </View>
  );
}

function ToolRow(props: { message: Of<"tool"> }) {
  return (
    <View class="flex-row items-center gap-2 self-start rounded-full border border-border px-3 py-1.5">
      <Icon name="check" size={14} tone="success" />
      <Text class="text-sm font-medium text-foreground">{props.message.title}</Text>
      <Text class="text-sm text-muted-foreground">{props.message.detail}</Text>
    </View>
  );
}

function ApprovalCard(props: { chatId: string; message: Of<"approval"> }) {
  const m = () => props.message;
  return (
    <View class="w-full max-w-md gap-3 self-start rounded-(--radius) border border-border bg-background p-4">
      <View class="flex-row items-center gap-2">
        <Icon name="lock" size={16} tone="muted-foreground" />
        <Text class="font-medium text-foreground">{m().action}</Text>
      </View>
      <Text class="text-sm text-muted-foreground">{m().detail}</Text>
      <If
        when={m().status === "pending"}
        else={<Text class="text-sm text-muted-foreground">{m().status === "allowed" ? "Allowed" : "Denied"}</Text>}
      >
        <View class="flex-row justify-end gap-2">
          <TextButton label="Deny" onPress={() => answerApproval(props.chatId, m().id, false)} />
          <TextButton label="Allow" variant="primary" onPress={() => answerApproval(props.chatId, m().id, true)} />
        </View>
      </If>
    </View>
  );
}

const sampleFiles = { file: "Q3 report.pdf", photo: "Whiteboard.jpg" } as const;

function Composer(props: { chatId: string }) {
  const attachments = signal<string[]>([]);
  const insets = safeAreaInsets();
  const draft = () => draftOf(props.chatId);
  const canSend = () => draft().trim().length > 0 || attachments().length > 0;
  const send = () => {
    if (!canSend()) return;
    const files = attachments().map((name) => `📎 ${name}`);
    sendMessage(props.chatId, [...files, draft()].filter((s) => s.trim()).join("\n"));
    setDraft(props.chatId, "");
    attachments.set([]);
  };
  const attach = (name: string) => attachments.update((all) => (all.includes(name) ? all : [...all, name]));
  return (
    <View class="mx-auto w-full max-w-3xl px-4 pt-2" style={{ paddingBottom: Math.max(insets().bottom, 12) }}>
      <View class="gap-1 rounded-3xl border border-border bg-card p-1.5">
        <If when={attachments().length > 0}>
          <View class="flex-row flex-wrap gap-1.5 px-1.5 pt-1">
            <Each of={attachments()} key={(name) => name}>
              {(name) => (
                <View class="flex-row items-center gap-1.5 rounded-full border border-border bg-background py-1 ps-2.5 pe-1">
                  <Icon name="paperclip" size={14} tone="muted-foreground" />
                  <Text class="text-sm text-foreground">{name()}</Text>
                  <Button
                    accessibilityLabel={`Remove ${name()}`}
                    onPress={() => attachments.update((all) => all.filter((n) => n !== name()))}
                    class="size-6 items-center justify-center rounded-full hover:bg-accent"
                  >
                    <Icon name="x" size={12} tone="muted-foreground" />
                  </Button>
                </View>
              )}
            </Each>
          </View>
        </If>
        <View class="flex-row items-end gap-2">
          <AppMenu trigger={<IconButton icon="plus" label="Add" />}>
            <MenuRow icon="paperclip" label="Attach file" onSelect={() => attach(sampleFiles.file)} />
            <MenuRow icon="image" label="Add photo" onSelect={() => attach(sampleFiles.photo)} />
          </AppMenu>
          <Input
            value={draft()}
            onChange={({ value }) => setDraft(props.chatId, value)}
            onSubmit={send}
            multiline
            submitBehavior="submit"
            placeholder={`Message ${chatById(props.chatId)?.title ?? ""}`}
            class="min-h-9 flex-1 py-2 text-foreground placeholder:text-muted-foreground"
          />
          <IconButton icon="arrow-up" label="Send" filled disabled={!canSend()} onPress={send} />
        </View>
      </View>
    </View>
  );
}

export function ChatView(props: { chatId: string }) {
  return (
    <View class="flex-1 bg-background">
      <ChatHeader chatId={props.chatId} />
      <List
        each={messagesFor(props.chatId)}
        keyExtractor={(m) => m.id}
        estimatedItemSize={96}
        maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 40 }}
        class="flex-1"
        contentClass="py-2"
      >
        {(message) => (
          // Keyed by id: a reused cell rebuilds for its new message instead of keeping the old one's kind.
          <Each of={[message()]} key={(m) => m.id}>
            {(m) => <Row chatId={props.chatId} message={m()} />}
          </Each>
        )}
      </List>
      <Composer chatId={props.chatId} />
    </View>
  );
}

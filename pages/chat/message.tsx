// One row of a chat's transcript: a message with its speaker, reply line, hover actions and reactions, or a divider.
import { Clipboard, type JSX, type Signal, signal, Text, View } from "nsh";
import { Button, Collapsible, Popover, TextView } from "nsh/base";
import { AppMenu, BotFace, Icon, MenuRow } from "../../components/ui";
import { wide } from "../../nav";
import { type Bot, botById, markMessageUnread, type Message, reactToMessage, unreadMarker } from "../../store";
import { AskCard } from "./ask";
import { plainText, replyTo, speakingId, toggleSpeak } from "./state";

/** Colors of the user's messages: the bot's own in a one-bot chat, the neutral ones in a group. */
export interface BubbleColors {
  background: string;
  foreground: string;
}

const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "😮"];

/** Reply, React and More beside a message on desktops (while the pointer is over it); under it on phones. */
function Rail(props: {
  chatId: string;
  message: Message;
  mine: boolean;
  reactOpen: Signal<boolean>;
  moreOpen: Signal<boolean>;
  copied: Signal<boolean>;
}) {
  const align = () => (props.mine ? "end" : "start");
  const button = () => `${wide() ? "size-7" : "size-11"} items-center justify-center rounded-md hover:bg-accent`;
  const copy = () => {
    void Clipboard.writeText(plainText(props.message));
    props.copied.set(true);
    setTimeout(() => props.copied.set(false), 1500);
  };
  return (
    <View
      class={
        wide()
          ? `absolute inset-y-0 justify-center ${props.mine ? "right-full mr-1" : "left-full ml-1"}`
          : `mt-1 w-full ${props.mine ? "items-end" : "items-start"}`
      }
    >
      <View class="flex-row items-center gap-0.5">
        <Popover
          open={props.reactOpen()}
          onOpenChange={({ open }) => props.reactOpen.set(open)}
          placement="top"
          align={align()}
          offset={4}
          popupClass="rounded-2xl border border-border bg-popover p-1.5 shadow-lg shadow-shadow-color"
          trigger={
            <Button accessibilityLabel="React" class={button()}>
              <Icon name="smile" size={15} tone="muted-foreground" />
            </Button>
          }
        >
          <View class="flex-row">
            <Each of={REACTIONS} key={(emoji) => emoji}>
              {(emoji) => (
                <Button
                  accessibilityLabel={emoji()}
                  onPress={() => {
                    props.reactOpen.set(false);
                    reactToMessage(props.chatId, props.message.id, emoji());
                  }}
                  class="size-11 items-center justify-center rounded-xl hover:bg-accent"
                >
                  <Text class="text-xl">{emoji()}</Text>
                </Button>
              )}
            </Each>
          </View>
        </Popover>
        <Button accessibilityLabel="Reply" onPress={() => replyTo(props.chatId, props.message)} class={button()}>
          <Icon name="reply" size={15} tone="muted-foreground" />
        </Button>
        <AppMenu
          align={align()}
          onOpenChange={(open) => props.moreOpen.set(open)}
          trigger={
            <Button accessibilityLabel={props.copied() ? "Copied" : "More"} class={button()}>
              <Icon name={props.copied() ? "check" : "ellipsis"} size={15} tone="muted-foreground" />
            </Button>
          }
        >
          <MenuRow icon="reply" label="Reply" onSelect={() => replyTo(props.chatId, props.message)} />
          <If when={unreadMarker(props.chatId) !== props.message.id}>
            <MenuRow icon="message-square-dot" label="Mark as unread" onSelect={() => markMessageUnread(props.chatId, props.message.id)} />
          </If>
          <MenuRow icon="copy" label="Copy" onSelect={copy} />
        </AppMenu>
      </View>
    </View>
  );
}

/** A message's box: the width bubbles stop at, and its actions. */
function Frame(props: { chatId: string; message: Message; mine?: boolean; card?: boolean; children: JSX.Element }) {
  const hovered = signal(false);
  const reactOpen = signal(false);
  const moreOpen = signal(false);
  const copied = signal(false);
  const shown = () => !wide() || hovered() || reactOpen() || moreOpen() || copied();
  return (
    <View class={`w-full flex-row ${props.mine ? "justify-end" : "justify-start"}`}>
      {/* Bubbles stop at 39rem, or at most 84% / 88% of the column, whichever is less; cards at 36rem. */}
      <View class={`flex-row ${props.card ? "w-full max-w-xl" : props.mine ? "max-w-[84%] justify-end" : "max-w-[88%]"}`}>
        <View
          onMouseEnter={() => hovered.set(true)}
          onMouseLeave={() => hovered.set(false)}
          class={props.card ? "w-full" : "max-w-[39rem]"}
        >
          {props.children}
          <If when={shown()}>
            <Rail
              chatId={props.chatId}
              message={props.message}
              mine={!!props.mine}
              reactOpen={reactOpen}
              moreOpen={moreOpen}
              copied={copied}
            />
          </If>
        </View>
      </View>
    </View>
  );
}

/** The bot a group chat's message is from. */
function Speaker(props: { bot: Bot }) {
  return (
    <View class="mb-1.5 flex-row items-center gap-2">
      <BotFace bot={props.bot} size={22} />
      <Text class="text-sm font-semibold" style={{ color: props.bot.color }}>
        {props.bot.name}
      </Text>
    </View>
  );
}

/** Who a reply quotes, above the message. */
function ReplyLine(props: { author: string; text: string; mine: boolean }) {
  return (
    <View class={`flex-row ${props.mine ? "justify-end" : ""}`}>
      <Text class="mb-1 max-w-full truncate text-xs text-muted-foreground">{`↩ ${props.author}: ${props.text.slice(0, 120)}`}</Text>
    </View>
  );
}

function Reactions(props: { reactions: Record<string, number>; mine: boolean }) {
  return (
    <View class={`mt-1 flex-row flex-wrap gap-1 ${props.mine ? "justify-end" : ""}`}>
      <Each of={Object.entries(props.reactions)} key={([emoji]) => emoji}>
        {(entry) => (
          <View class="rounded-full border border-border bg-muted px-2 py-0.5">
            <Text class="text-xs text-foreground">{`${entry()[0]}${entry()[1] > 1 ? ` ${entry()[1]}` : ""}`}</Text>
          </View>
        )}
      </Each>
    </View>
  );
}

/** Marks where the messages the user marked as unread begin. */
function UnreadDivider() {
  return (
    <View class="flex-row items-center gap-2.5 pt-3.5 pb-2">
      <View class="h-px flex-1 bg-unread opacity-50" />
      <Text class="text-xs font-semibold tracking-wide text-unread uppercase">New</Text>
      <View class="h-px flex-1 bg-unread opacity-50" />
    </View>
  );
}

/** A run of tool calls, folded to one line. */
function ToolActivity(props: { label: string }) {
  const open = signal(false);
  return (
    <View class="self-start ps-1">
      <Collapsible
        open={open()}
        content={
          <View class="ms-[7px] mt-0.5 border-s border-border ps-3">
            <View class="flex-row items-center gap-2">
              <Text class="text-xs text-success">✓</Text>
              <Text class="min-w-0 flex-1 text-sm text-muted-foreground">{props.label}</Text>
            </View>
          </View>
        }
      >
        <View
          role="button"
          accessibilityLabel="Done 1 tool"
          accessibilityState={{ expanded: open() }}
          onPress={() => open.set(!open())}
          class="min-h-6 flex-row items-center gap-1 self-start py-0.5 pe-1.5"
        >
          <Icon name={open() ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
          <Text class="text-sm font-medium text-muted-foreground">Done</Text>
          <Text class="text-sm font-medium text-muted-foreground">1 tool</Text>
        </View>
      </Collapsible>
    </View>
  );
}

function Speak(props: { message: Message }) {
  const speaking = () => speakingId() === props.message.id;
  return (
    <Button
      accessibilityLabel={speaking() ? "Stop speaking" : "Speak this reply"}
      onPress={() => toggleSpeak(props.message)}
      class="mt-2 self-start rounded-md py-0.5"
    >
      <Text class="text-xs text-muted-foreground hover:text-foreground">{speaking() ? "Stop" : "Speak"}</Text>
    </Button>
  );
}

export function Row(props: { chatId: string; message: Message; group: boolean; bubble?: BubbleColors }) {
  const m = props.message;
  const mine = m.kind === "user";
  const speaker = () => (props.group && (m.kind === "bot" || m.kind === "ask") ? botById(m.botId) : undefined);
  return (
    <View class="items-center py-1">
      <View class="w-full max-w-[60rem]">
        {(() => {
          switch (m.kind) {
            case "date":
              return (
                <Text role="header" class="my-3 select-none self-center text-xs text-muted-foreground">
                  {m.label}
                </Text>
              );
            case "tool":
              return <ToolActivity label={m.label} />;
            default:
              return (
                <>
                  <If when={unreadMarker(props.chatId) === m.id}>
                    <UnreadDivider />
                  </If>
                  <If when={speaker()}>{(bot) => <Speaker bot={bot()} />}</If>
                  <If when={m.kind === "user" ? m.reply : undefined}>
                    {(reply) => <ReplyLine author={reply().author} text={reply().text} mine />}
                  </If>
                  <Frame chatId={props.chatId} message={m} mine={mine} card={m.kind === "ask"}>
                    {m.kind === "user" ? (
                      <View
                        class="rounded-2xl bg-chat-user px-[18px] py-3"
                        style={props.bubble ? { backgroundColor: props.bubble.background } : undefined}
                      >
                        <Text class="text-chat-user-foreground" style={props.bubble ? { color: props.bubble.foreground } : undefined}>
                          {m.text}
                        </Text>
                      </View>
                    ) : m.kind === "bot" ? (
                      <View class="rounded-2xl bg-muted px-[18px] py-3">
                        <TextView markdown={m.markdown} selectable class="text-foreground" />
                        <Speak message={m} />
                      </View>
                    ) : m.kind === "ask" ? (
                      <AskCard chatId={props.chatId} message={props.message as Extract<Message, { kind: "ask" }>} />
                    ) : null}
                  </Frame>
                  <If when={props.message.reactions}>{(reactions) => <Reactions reactions={reactions()} mine={mine} />}</If>
                </>
              );
          }
        })()}
      </View>
    </View>
  );
}

// A chat's composer: the reply being quoted, attachments, the text and Send.
import { Picker, safeAreaInsets, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Icon } from "../../components/ui";
import { currentPreferences, chatById, sendMessage } from "../../store";
import { wide } from "../../nav";
import type { BubbleColors } from "./message";
import { draftOf, replyOf, setDraft, setReply } from "./state";

export function Composer(props: { chatId: string; bubble?: BubbleColors }) {
  const attachments = signal<string[]>([]);
  const insets = safeAreaInsets();
  const draft = () => draftOf(props.chatId);
  const canSend = () => draft().trim().length > 0 || attachments().length > 0;
  const send = () => {
    if (!canSend()) return;
    const files = attachments().map((name) => `📎 ${name}`);
    sendMessage(props.chatId, [...files, draft()].filter((s) => s.trim()).join("\n"), replyOf(props.chatId));
    setDraft(props.chatId, "");
    setReply(props.chatId, undefined);
    attachments.set([]);
  };
  // The system's picker gives photos only: NSH has no picker for other files.
  const attach = async () => {
    const picked = await Picker.pickImages({ multiple: true });
    attachments.update((all) => [...all, ...picked.map((p) => p.file.name).filter((name) => !all.includes(name))]);
  };
  const enterSends = () => currentPreferences().sendWithEnter;
  return (
    <View
      class="mx-auto w-full max-w-[60rem] pt-2"
      style={{ paddingBottom: Math.max(insets().bottom, 12), paddingHorizontal: wide() ? 28 : 16 }}
    >
      <If when={replyOf(props.chatId)}>
        {(reply) => (
          <View class="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-muted px-3 py-1.5">
            <Text class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{`${reply().author}: ${reply().text}`}</Text>
            <Button
              accessibilityLabel="Cancel reply"
              onPress={() => setReply(props.chatId, undefined)}
              class="size-6 items-center justify-center rounded-full hover:bg-accent"
            >
              <Icon name="x" size={13} tone="muted-foreground" />
            </Button>
          </View>
        )}
      </If>
      <View class="gap-1 rounded-[26px] border border-border bg-background py-[9px] ps-3 pe-2.5 dark:bg-card">
        <If when={attachments().length > 0}>
          <View class="flex-row flex-wrap gap-1.5 pb-1">
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
        <View class="flex-row items-end gap-3.5">
          <Button
            accessibilityLabel="Attach file"
            onPress={attach}
            class="size-8 items-center justify-center rounded-full border border-border bg-muted hover:bg-accent active:bg-accent"
          >
            <Icon name="plus" size={16} tone="muted-foreground" />
          </Button>
          <Input
            value={draft()}
            onChange={({ value }) => setDraft(props.chatId, value)}
            onSubmit={() => enterSends() && send()}
            multiline
            submitBehavior={enterSends() ? "submit" : "newline"}
            placeholder={`Message ${chatById(props.chatId)?.title ?? ""}`}
            class="min-h-8 flex-1 py-1 text-foreground placeholder:text-muted-foreground"
          />
          <Button
            accessibilityLabel="Send"
            disabled={!canSend()}
            onPress={send}
            class={`size-8 items-center justify-center rounded-full ${canSend() ? (props.bubble ? "" : "bg-primary active:bg-primary/80") : "bg-primary-disabled"}`}
            style={canSend() && props.bubble ? { backgroundColor: props.bubble.background } : undefined}
          >
            <View class={canSend() ? "" : "opacity-30"}>
              <Icon
                name="arrow-up"
                size={16}
                tone="primary-foreground"
                color={canSend() && props.bubble ? props.bubble.foreground : undefined}
              />
            </View>
          </Button>
        </View>
      </View>
    </View>
  );
}

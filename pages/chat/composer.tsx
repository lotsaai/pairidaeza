// A chat's composer: the reply being quoted, attachments, the text and Send.
import { Picker, platform, safeAreaInsets, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { AppMenu, Icon, MenuRow } from "../../components/ui";
import { currentPreferences, chatById, sendMessage } from "../../store";
import { wide } from "../../nav";
import type { BubbleColors } from "./message";
import { draftOf, replyOf, setDraft, setReply } from "./state";

export function Composer(props: { chatId: string; bubble?: BubbleColors }) {
  const attachments = signal<string[]>([]);
  const picking = signal(false);
  const pickerError = signal("");
  const attachMenuOpen = signal(false);
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
  const attach = async (source: "files" | "photos") => {
    if (picking()) return;
    picking.set(true);
    pickerError.set("");
    try {
      const picked = source === "photos" ? await Picker.pickImages({ multiple: true }) : await Picker.pickFiles({ multiple: true });
      if (picked.length) {
        attachments.update((all) => [...new Set([...all, ...picked.map((p) => p.file.name)])]);
      }
    } catch {
      pickerError.set("Could not open the file picker. Please try again.");
    } finally {
      picking.set(false);
    }
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
          <If
            when={!platform.desktop}
            else={
              <Button
                accessibilityLabel="Attach file"
                disabled={picking()}
                onPress={() => attach("files")}
                class="size-8 items-center justify-center rounded-full border border-border bg-muted hover:bg-accent active:bg-accent"
              >
                <Icon name="plus" size={16} tone="muted-foreground" />
              </Button>
            }
          >
            <AppMenu
              onOpenChange={(open) => attachMenuOpen.set(open)}
              trigger={
                <Button
                  accessibilityLabel="Attach file"
                  disabled={picking()}
                  class={`size-11 items-center justify-center rounded-full border border-border ${attachMenuOpen() || picking() ? "bg-accent" : "bg-muted"} hover:bg-accent active:bg-accent`}
                >
                  <Icon name="plus" size={16} tone="muted-foreground" />
                </Button>
              }
            >
              <View style={{ paddingBottom: insets().bottom }}>
                <MenuRow class="min-h-11" icon="image" label="Photo library…" onSelect={() => attach("photos")} />
                <MenuRow class="min-h-11" icon="folder-open" label="Browse files…" onSelect={() => attach("files")} />
              </View>
            </AppMenu>
          </If>
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
      <If when={pickerError()}>{(error) => <Text class="px-3 pt-1 text-sm text-destructive">{error()}</Text>}</If>
    </View>
  );
}

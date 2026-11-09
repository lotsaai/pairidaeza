// A bot's card in the chat: a question with lettered options, an approval, or a proposed change to its instructions.
import { signal, Text, View } from "nsh";
import { Button, Input, TextView } from "nsh/base";
import { Icon } from "../../components/ui";
import { answerAsk, type AskAction, type Message } from "../../store";

type Ask = Extract<Message, { kind: "ask" }>;

const letter = (index: number) => String.fromCharCode(65 + index);

/** A lettered answer: it fills only on hover or once chosen. */
function OptionRow(props: { letter: string; label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Button
      accessibilityLabel={props.label}
      disabled={props.disabled}
      selected={props.selected}
      onPress={props.onPress}
      class="-mx-2 flex-row items-center gap-3 rounded-(--radius) px-2 py-2 hover:bg-accent active:bg-accent selected:bg-accent"
    >
      <View class="size-7 items-center justify-center rounded-md border border-border bg-muted">
        <Text class="text-sm text-muted-foreground">{props.letter}</Text>
      </View>
      <Text class="flex-1 text-foreground">{props.label}</Text>
      <If when={props.selected}>
        <Icon name="check" size={16} tone="muted-foreground" />
      </If>
    </Button>
  );
}

/** What a card says once answered. */
function answeredLabel(card: Ask) {
  const chosen = card.actions.find((a) => a.id === card.answer);
  if (card.variant === "instructions") return card.answer === "deny" ? "Dismissed" : "Allowed once";
  if (card.answer === "allow") return "Allowed once";
  if (card.answer === "always") return "Always allowed";
  if (card.answer === "deny") return "Denied";
  return chosen?.label ?? "Answered";
}

function ActionButton(props: { card: Ask; action: AskAction; onPress: () => void }) {
  const primary = () => props.action.id === "allow";
  return (
    <Button
      accessibilityLabel={props.action.label}
      onPress={props.onPress}
      class={`min-h-8 items-center justify-center rounded-full px-4 py-1.5 ${primary() ? "bg-primary active:bg-primary/80" : "border border-border bg-background hover:bg-accent active:bg-accent"}`}
    >
      <Text class={`text-sm font-medium ${primary() ? "text-primary-foreground" : "text-foreground"}`}>{props.action.label}</Text>
    </Button>
  );
}

/** The new instructions, editable before they are applied. */
function InstructionsEditor(props: { chatId: string; card: Ask; onDone: () => void }) {
  const text = signal(props.card.detail ?? "");
  return (
    <View class="mt-3 gap-2">
      <Input
        accessibilityLabel="Instructions"
        value={text()}
        onChange={({ value }) => text.set(value)}
        multiline
        class="min-h-24 rounded-(--radius) border border-input bg-background px-3 py-2 text-foreground"
      />
      <View class="flex-row gap-2">
        <ActionButton
          card={props.card}
          action={{ id: "allow", label: "Apply" }}
          onPress={() => answerAsk(props.chatId, props.card.id, "allow", text())}
        />
        <ActionButton card={props.card} action={{ id: "cancel", label: "Cancel" }} onPress={props.onDone} />
      </View>
    </View>
  );
}

export function AskCard(props: { chatId: string; message: Ask }) {
  const card = () => props.message;
  const editing = signal(false);
  const answered = () => card().answer !== undefined;
  return (
    <View class="w-full max-w-xl rounded-2xl bg-card px-5 py-4">
      <TextView markdown={card().text} class="text-card-foreground" />
      <If when={card().detail && card().variant !== "options"}>
        <View class="mt-2.5 max-h-72 rounded-lg bg-background px-3 py-2">
          <Text class="font-mono text-sm text-foreground">{card().detail}</Text>
        </View>
      </If>
      <If
        when={card().variant === "options"}
        else={
          <If
            when={answered()}
            else={
              <If
                when={editing()}
                else={
                  <View class="mt-3.5 flex-row flex-wrap gap-2">
                    <Each of={card().actions} key={(a) => a.id}>
                      {(action) => (
                        <ActionButton
                          card={card()}
                          action={action()}
                          onPress={() => (action().id === "edit" ? editing.set(true) : answerAsk(props.chatId, card().id, action().id))}
                        />
                      )}
                    </Each>
                  </View>
                }
              >
                <InstructionsEditor chatId={props.chatId} card={card()} onDone={() => editing.set(false)} />
              </If>
            }
          >
            <View class="mt-3.5 flex-row items-center gap-1.5">
              <If when={card().answer !== "deny"}>
                <Icon name="check" size={16} tone="muted-foreground" />
              </If>
              <Text class="text-sm font-medium text-muted-foreground">{answeredLabel(card())}</Text>
            </View>
          </If>
        }
      >
        {/* Options stay in place once answered: the chosen one is marked, the rest dim. */}
        <View class="mt-2.5 gap-0.5">
          <Each of={card().actions} key={(a) => a.id}>
            {(action) => (
              <OptionRow
                letter={letter(card().actions.indexOf(action()))}
                label={action().label}
                selected={card().answer === action().id}
                disabled={answered()}
                onPress={() => answerAsk(props.chatId, card().id, action().id)}
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

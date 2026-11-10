// Creating a bot: a name and an identity color, then its chat opens.
import { signal, Text, View } from "nsh";
import { Button, Dialog, Input } from "nsh/base";
import { BotFace, IconButton, TextButton } from "../components/ui";
import { newBotOpen, openChat } from "../nav";
import { botColors, createBot } from "../store";

export function NewBotDialog() {
  const name = signal("");
  const color = signal(botColors[0]);
  const close = () => {
    newBotOpen.set(false);
    name.set("");
  };
  const create = () => {
    if (!name().trim()) return;
    const id = createBot(name(), color());
    close();
    openChat(id);
  };
  return (
    <Dialog
      open={newBotOpen()}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-24 w-full max-w-md gap-5 self-center rounded-(--radius) border border-border bg-popover p-5 shadow-lg shadow-shadow-color"
    >
      <View class="flex-row items-center justify-between">
        <Text role="header" class="text-lg font-semibold text-popover-foreground">
          New bot
        </Text>
        <IconButton icon="x" label="Close" onPress={close} />
      </View>
      <View class="items-center">
        <BotFace
          bot={{ id: "preview", name: name(), color: color(), instructions: "", model: "default", notifyOnFinish: true, computer: "team" }}
          size={64}
        />
      </View>
      <Input
        value={name()}
        onChange={({ value }) => name.set(value)}
        onSubmit={create}
        autoFocus
        placeholder="Name"
        accessibilityLabel="Bot name"
        class="min-h-10 rounded-(--radius) border border-input px-3 text-foreground placeholder:text-muted-foreground"
      />
      <View class="flex-row flex-wrap justify-center gap-2">
        <Each of={botColors} key={(c) => c}>
          {(c) => (
            <Button
              accessibilityLabel={`Color ${c()}`}
              selected={color() === c()}
              onPress={() => color.set(c())}
              class="size-8 items-center justify-center rounded-full border-2 border-transparent selected:border-foreground"
            >
              <View class="size-6 rounded-full" style={{ backgroundColor: c() }} />
            </Button>
          )}
        </Each>
      </View>
      <View class="flex-row justify-end gap-2">
        <TextButton label="Cancel" onPress={close} />
        <TextButton label="Create" variant="primary" onPress={create} />
      </View>
    </Dialog>
  );
}

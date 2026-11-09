// A new space: a private place with its own bots, groups and sections.
// Skipped: a second step choosing which skills and servers the space may use; no backend for those here.
import { Icon, IconButton, TextButton, Field, fieldClass } from "../components/ui";
import { signal, Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";
import { newSpaceOpen } from "../nav";
import { createSpace, SPACE_NAME_MAX_LENGTH } from "../store";

const name = signal("");

const close = () => {
  newSpaceOpen.set(false);
  name.set("");
};

const create = () => {
  if (!name().trim()) return;
  createSpace(name());
  close();
};

export function NewSpaceDialog() {
  return (
    <Dialog
      open={newSpaceOpen()}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-24 w-full max-w-sm gap-4 self-center rounded-(--radius) border border-border bg-popover p-5 shadow-lg"
    >
      <View class="flex-row items-center gap-2">
        <Icon name="lock" size={18} tone="muted-foreground" />
        <Text role="header" class="flex-1 text-lg font-semibold text-popover-foreground">
          New space
        </Text>
        <IconButton icon="x" label="Close" onPress={close} />
      </View>
      <Field label="Name">
        <Input
          value={name()}
          onChange={({ value }) => name.set(value)}
          onSubmit={create}
          autoFocus
          maxLength={SPACE_NAME_MAX_LENGTH}
          placeholder="Customer support"
          accessibilityLabel="Name"
          class={fieldClass}
        />
      </Field>
      <View class="flex-row justify-end gap-2">
        <TextButton label="Cancel" onPress={close} />
        <View class={name().trim() ? "" : "opacity-40"}>
          <TextButton label="Create space" variant="primary" onPress={create} />
        </View>
      </View>
    </Dialog>
  );
}

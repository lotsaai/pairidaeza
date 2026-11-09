// Naming a section: a new one (moving the chat it came from into it) or a rename.
import { Text, View } from "nsh";
import { Dialog, Input } from "nsh/base";
import { IconButton, TextButton } from "../components/ui";
import { sectionDialog, sectionName } from "../nav";
import { createSection, renameSection, setChatSection } from "../store";

export function SectionDialog() {
  const close = () => sectionDialog.set(null);
  const save = () => {
    const edit = sectionDialog();
    if (!edit || !sectionName().trim()) return;
    if (edit.id) renameSection(edit.id, sectionName());
    else {
      const id = createSection(sectionName());
      if (edit.chatId) setChatSection(edit.chatId, id);
    }
    close();
  };
  return (
    <Dialog
      open={sectionDialog() !== null}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-24 w-full max-w-sm gap-4 self-center rounded-(--radius) border border-border bg-popover p-5 shadow-lg"
    >
      <View class="flex-row items-center justify-between">
        <Text role="header" class="text-lg font-semibold text-popover-foreground">
          {sectionDialog()?.id ? "Rename section" : "New section"}
        </Text>
        <IconButton icon="x" label="Close" onPress={close} />
      </View>
      <Input
        value={sectionName()}
        onChange={({ value }) => sectionName.set(value)}
        onSubmit={save}
        autoFocus
        placeholder="Section name"
        accessibilityLabel="Section name"
        class="min-h-10 rounded-(--radius) border border-input px-3 text-foreground placeholder:text-muted-foreground"
      />
      <View class="flex-row justify-end gap-2">
        <TextButton label="Cancel" onPress={close} />
        <TextButton label={sectionDialog()?.id ? "Rename" : "Create"} variant="primary" onPress={save} />
      </View>
    </Dialog>
  );
}

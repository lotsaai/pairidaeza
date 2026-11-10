// A space's settings: its name, who belongs (invite links, removing people), and leaving or deleting it.
import { Clipboard, Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Dialog, Input } from "nsh/base";
import { Field, fieldClass, IconButton, SectionTitle, TextButton } from "../components/ui";
import { spaceSettingsId } from "../nav";
import {
  cancelInvites,
  createInvite,
  deleteSpace,
  leaveSpace,
  removeMember,
  renameSpace,
  SPACE_NAME_MAX_LENGTH,
  spaceById,
} from "../store";

const close = () => spaceSettingsId.set(null);

/** What is typed in the name field, or null to show the saved name. */
const draft = signal<string | null>(null);
/** Set by Escape so the blur that follows it doesn't save. */
let reverting = false;

async function confirm(title: string, description: string, verb: string) {
  const { action } = await AlertDialog.show({
    title,
    description,
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: verb, role: "destructive", id: "yes" },
    ],
  });
  return action === "yes";
}

function Body(props: { id: string }) {
  const space = () => spaceById(props.id);
  const save = () => {
    const value = draft()?.trim();
    draft.set(null);
    if (!reverting && value) renameSpace(props.id, value);
    reverting = false;
  };
  return (
    <If when={space()}>
      {(s) => (
        <Scroll class="max-h-[32rem]" contentClass="gap-5">
          <Field label="Name">
            <Input
              value={draft() ?? s().name}
              onChange={({ value }) => draft.set(value)}
              onSubmit={save}
              onBlur={save}
              onKeyPress={({ key }) => {
                if (key === "Escape") reverting = true;
              }}
              maxLength={SPACE_NAME_MAX_LENGTH}
              accessibilityLabel="Name"
              class={fieldClass}
            />
          </Field>
          <View class="gap-2">
            <SectionTitle>Members</SectionTitle>
            <View class="flex-row items-center gap-2 px-1">
              <Text class="flex-1 text-sm text-muted-foreground">
                {s().openInvites > 0 ? `${s().openInvites} open invite${s().openInvites === 1 ? "" : "s"}` : "No open invites"}
              </Text>
              <If when={s().openInvites > 0}>
                <TextButton label="Cancel invites" variant="ghost" onPress={() => cancelInvites(s().id)} />
              </If>
              <TextButton label="Invite" onPress={() => void Clipboard.writeText(createInvite(s().id))} />
            </View>
            <Each of={s().members} key={(m) => m.id}>
              {(m) => (
                <View class="min-h-11 flex-row items-center gap-3 px-1">
                  <View class="flex-1">
                    <Text class="text-foreground">{m().name}</Text>
                    <Text class="text-sm text-muted-foreground">{m().email}</Text>
                  </View>
                  <Text class="text-sm text-muted-foreground">{m().role === "owner" ? "Owner" : "Member"}</Text>
                  <If when={m().role !== "owner"}>
                    <IconButton icon="x" label={`Remove ${m().name}`} onPress={() => removeMember(s().id, m().id)} />
                  </If>
                </View>
              )}
            </Each>
          </View>
          <If when={!s().isDefault}>
            <View class="flex-row justify-end gap-2">
              <TextButton
                label="Leave space"
                onPress={async () => {
                  if (!(await confirm(`Leave "${s().name}"?`, "It leaves your sidebar.", "Leave"))) return;
                  close();
                  leaveSpace(s().id);
                }}
              />
              <TextButton
                label="Delete space"
                onPress={async () => {
                  if (!(await confirm(`Delete "${s().name}"?`, "Its bots, groups and chats are deleted too.", "Delete"))) return;
                  close();
                  deleteSpace(s().id);
                }}
              />
            </View>
          </If>
        </Scroll>
      )}
    </If>
  );
}

export function SpaceSettingsDialog() {
  return (
    <Dialog
      open={spaceSettingsId() !== null}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-24 w-full max-w-md gap-4 self-center rounded-(--radius) border border-border bg-popover p-5 shadow-lg shadow-shadow-color"
    >
      <View class="flex-row items-center justify-between">
        <Text role="header" class="text-lg font-semibold text-popover-foreground">
          Space settings
        </Text>
        <IconButton icon="x" label="Close" onPress={close} />
      </View>
      <If when={spaceSettingsId()}>{(id) => <Body id={id()} />}</If>
    </Dialog>
  );
}

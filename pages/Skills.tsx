// Skills: the SKILL.md files bots can use. Your skills list, then an editor for the one opened.
// Skipped until there is a backend: Templates, From GitHub, and the plugin skill pack Browse list.
import { Scroll, signal, Text, View } from "nsh";
import { Button, Dialog, Input } from "nsh/base";
import { fieldClass, Icon, IconButton, SectionTitle, TextButton } from "../components/ui";
import { skillsOpen } from "../nav";
import { allSkills, createSkill, deleteSkill, saveSkill, type Skill } from "../store";

/** The skill in the editor, or null for the list. */
const openId = signal<string | null>(null);
const draft = signal("");
/** The first Delete press arms it; the second deletes. */
const confirmingDelete = signal(false);

const current = () => allSkills().find((k) => k.id === openId());

function edit(skill: Skill) {
  draft.set(skill.content);
  confirmingDelete.set(false);
  openId.set(skill.id);
}

const closeEditor = () => {
  openId.set(null);
  confirmingDelete.set(false);
};

function close() {
  closeEditor();
  skillsOpen.set(false);
}

function save(skill: Skill) {
  if (!draft().trim()) return;
  saveSkill(skill.id, draft());
  closeEditor();
}

function remove(skill: Skill) {
  if (!confirmingDelete()) return confirmingDelete.set(true);
  deleteSkill(skill.id);
  closeEditor();
}

function PluginBadge() {
  return (
    <View class="rounded-full bg-secondary px-2 py-0.5">
      <Text class="text-xs text-muted-foreground">Plugin</Text>
    </View>
  );
}

function Editor(props: { skill: Skill }) {
  const readOnly = () => props.skill.source === "plugin";
  return (
    <View class="gap-3">
      <View class="min-h-7 flex-row items-center gap-2">
        <Text class="flex-1 font-medium text-popover-foreground">{props.skill.name}</Text>
        <If when={readOnly()}>
          <PluginBadge />
        </If>
      </View>
      <Input
        multiline
        value={draft()}
        onChange={({ value }) => draft.set(value)}
        readonly={readOnly()}
        accessibilityLabel="SKILL.md"
        class={`${fieldClass} min-h-48 py-2 font-mono text-sm`}
      />
      <View class="flex-row items-center gap-2">
        <If when={!readOnly()}>
          <TextButton label="Save" variant="primary" onPress={() => save(props.skill)} />
        </If>
        <TextButton label={readOnly() ? "Close" : "Cancel"} onPress={closeEditor} />
        <View class="flex-1" />
        <If when={!readOnly()}>
          <TextButton label={confirmingDelete() ? "Confirm delete" : "Delete"} variant="ghost" onPress={() => remove(props.skill)} />
        </If>
      </View>
    </View>
  );
}

function SkillList() {
  return (
    <View class="gap-2">
      <SectionTitle>Your skills</SectionTitle>
      <If when={allSkills().length === 0}>
        <Text class="px-1 text-muted-foreground">No skills yet</Text>
      </If>
      <Each of={allSkills()} key={(k) => k.id}>
        {(skill) => (
          <Button onPress={() => edit(skill())} class="gap-0.5 rounded-(--radius) px-2.5 py-2 hover:bg-accent active:bg-accent">
            <View class="flex-row items-center justify-between gap-3">
              <Text class="min-w-0 flex-1 truncate text-popover-foreground">{skill().name}</Text>
              <If when={skill().source === "plugin"}>
                <PluginBadge />
              </If>
            </View>
            <Text class="truncate text-sm text-muted-foreground">{skill().description}</Text>
          </Button>
        )}
      </Each>
      <Button
        onPress={() => {
          const id = createSkill();
          const skill = allSkills().find((k) => k.id === id);
          if (skill) edit(skill);
        }}
        class="min-h-11 flex-row items-center justify-between rounded-(--radius) px-2.5 py-2 hover:bg-accent active:bg-accent"
      >
        <Text class="text-popover-foreground">New skill</Text>
        <Icon name="plus" size={16} tone="muted-foreground" />
      </Button>
    </View>
  );
}

export function SkillsDialog() {
  return (
    <Dialog
      open={skillsOpen()}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-16 h-[80%] w-full max-w-2xl self-center rounded-(--radius) border border-border bg-popover shadow-lg shadow-shadow-color"
    >
      <View class="flex-row items-center justify-between px-5 pt-5">
        <Text role="header" class="text-lg font-semibold text-popover-foreground">
          Skills
        </Text>
        <IconButton icon="x" label="Close skills" onPress={close} />
      </View>
      <Scroll class="flex-1" contentClass="p-5">
        <If when={current()} else={<SkillList />}>
          {(skill) => <Editor skill={skill()} />}
        </If>
      </Scroll>
    </Dialog>
  );
}

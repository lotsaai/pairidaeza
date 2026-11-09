// A plugin's page: its apps (the MCP connector) and its skills, each added on its own.
import { type JSX, openUrl, signal, Text, View } from "nsh";
import { Button } from "nsh/base";
import { Icon, TextButton } from "../../components/ui";
import { selectedChatId } from "../../nav";
import { botById } from "../../store";
import { assign, installOf, isAssigned, type Plugin, pluginBySource, type PluginPart, setPart, signIn } from "./catalog";
import { confirmRemove, Logo } from "./parts";

/** Skills listed before "# more". */
const SKILLS_SHOWN = 5;

/** A repo link: `repo#subdir` lives under `tree/HEAD/subdir`. */
const sourceHref = (source: string) => {
  const [repo, subdir] = source.split("#");
  return subdir ? `${repo}/tree/HEAD/${subdir}` : repo;
};

/** The recipe open under a skill, by plugin source and skill name. */
const recipe = signal<string | null>(null);
const allSkills = signal(false);

function Heading(props: { title: string; count: number }) {
  return (
    <View class="flex-row gap-2">
      <Text role="header" class="font-medium text-foreground">
        {props.title}
      </Text>
      <Text class="text-muted-foreground">{props.count}</Text>
    </View>
  );
}

function Rows(props: { children: JSX.Element }) {
  return <View class="overflow-hidden rounded-xl border border-border">{props.children}</View>;
}

function AppsSection(props: { plugin: Plugin; botId: string | undefined }) {
  const install = () => installOf(props.plugin.source);
  const listed = () => Boolean(install()?.parts.includes("connector"));
  return (
    <View class="gap-2">
      <Heading title="Apps" count={props.plugin.servers.length} />
      <Rows>
        <Each of={props.plugin.servers} key={(s) => s.name}>
          {(server, index) => (
            <View class={`flex-row items-center gap-3 px-4 py-3 ${index() > 0 ? "border-t border-border" : ""}`}>
              <Icon name="plug" size={16} tone="muted-foreground" />
              <View class="min-w-0 flex-1">
                <Text class="truncate font-medium text-foreground">{server().name}</Text>
                <If when={server().endpoint}>{(e) => <Text class="truncate text-sm text-muted-foreground">{e()}</Text>}</If>
              </View>
              <If when={listed()}>
                <If
                  when={install()?.signedIn.includes(server().name)}
                  else={<TextButton variant="secondary" label="Sign in" onPress={() => signIn(props.plugin.source, server().name)} />}
                >
                  <Icon name="check" size={16} tone="success" />
                  <Text class="text-sm text-success">Connected</Text>
                </If>
                <If when={props.botId}>
                  {(botId) => (
                    <If
                      when={!isAssigned(botId(), props.plugin.source, server().name)}
                      else={<Text class="text-sm text-muted-foreground">In this bot</Text>}
                    >
                      <TextButton variant="secondary" label="Use in this bot" onPress={() => assign(botId(), props.plugin.source, server().name)} />
                    </If>
                  )}
                </If>
              </If>
            </View>
          )}
        </Each>
      </Rows>
    </View>
  );
}

function SkillsSection(props: { plugin: Plugin; skillPack: boolean }) {
  const skillsOn = () => Boolean(installOf(props.plugin.source)?.parts.includes("skills"));
  const shown = () => (allSkills() ? props.plugin.skills : props.plugin.skills.slice(0, SKILLS_SHOWN));
  const more = () => props.plugin.skills.length - shown().length;
  return (
    <View class="gap-2">
      <View class="flex-row items-center justify-between gap-3">
        <Heading title="Skills" count={props.plugin.skills.length} />
        <If when={!props.skillPack}>
          <TextButton
            variant="secondary"
            label={skillsOn() ? "Remove skills" : "Add skills"}
            onPress={() => setPart(props.plugin.source, "skills", !skillsOn())}
          />
        </If>
      </View>
      <Rows>
        <Each of={shown()} key={(s) => s.name}>
          {(skill, index) => (
            <View class={index() > 0 ? "border-t border-border" : ""}>
              <Button
                accessibilityLabel={skill().name}
                disabled={!skillsOn()}
                onPress={() => recipe.update((open) => (open === skill().name ? null : skill().name))}
                class="flex-row items-center gap-3 px-4 py-3 hover:bg-accent/60"
              >
                <Icon name="file-text" size={16} tone="muted-foreground" />
                <View class="min-w-0 flex-1">
                  <Text class="truncate font-medium text-foreground">{skill().name}</Text>
                  <Text class="truncate text-sm text-muted-foreground">{skill().description}</Text>
                </View>
              </Button>
              <If when={skillsOn() && recipe() === skill().name && skill().content}>
                {(content) => <Text class="border-t border-border px-4 py-3 font-mono text-sm text-foreground">{content()}</Text>}
              </If>
            </View>
          )}
        </Each>
        <If when={more() > 0}>
          <View class="items-end px-2 py-1.5">
            <TextButton variant="ghost" label={`${more()} more`} onPress={() => allSkills.set(true)} />
          </View>
        </If>
      </Rows>
    </View>
  );
}

function Body(props: { plugin: Plugin }) {
  const botId = () => botById(selectedChatId())?.id;
  const install = () => installOf(props.plugin.source);
  // Without a connector there is nothing to connect, so the page adds the skills instead.
  const skillPack = props.plugin.servers.length === 0;
  const headerPart: PluginPart = skillPack ? "skills" : "connector";
  const headerOn = () => Boolean(install()?.parts.includes(headerPart));
  return (
    <View class="gap-7">
      <View class="flex-row items-start gap-4">
        <Logo name={props.plugin.displayName} large />
        <View class="min-w-0 flex-1 gap-1 pt-1">
          <Text role="header" class="truncate text-xl font-semibold text-foreground">
            {props.plugin.displayName}
          </Text>
          <Button accessibilityLabel="View source" onPress={() => void openUrl(sourceHref(props.plugin.source))} class="flex-row items-center gap-1">
            <Text class="text-muted-foreground">View source</Text>
            <Icon name="arrow-up-right" size={14} tone="muted-foreground" />
          </Button>
        </View>
        <If
          when={headerOn()}
          else={<TextButton variant="primary" label={skillPack ? "Add" : "Connect"} onPress={() => setPart(props.plugin.source, headerPart, true)} />}
        >
          <TextButton
            variant="secondary"
            label="Remove"
            onPress={() => void confirmRemove(props.plugin.displayName).then((yes) => yes && setPart(props.plugin.source, headerPart, false))}
          />
        </If>
      </View>
      <If when={props.plugin.description}>{(d) => <Text class="text-muted-foreground">{d()}</Text>}</If>
      <If when={!skillPack}>
        <AppsSection plugin={props.plugin} botId={botId()} />
      </If>
      <If when={props.plugin.skills.length > 0}>
        <SkillsSection plugin={props.plugin} skillPack={skillPack} />
      </If>
    </View>
  );
}

export function PluginDetail(props: { source: string }) {
  return <If when={pluginBySource(props.source)}>{(plugin) => <Body plugin={plugin()} />}</If>;
}

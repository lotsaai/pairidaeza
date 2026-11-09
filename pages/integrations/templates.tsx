// Bot templates: search and category chips, then a template's page with the prompt it adds and the apps it works with.
import { openUrl, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { fieldClass, Icon, TextButton } from "../../components/ui";
import { integrationsOpen, openChat } from "../../nav";
import { botColors, createBot, updateBot } from "../../store";
import { apps, isConnected, matchesWordPrefixes } from "./catalog";
import { Cell, Grid, Logo, Row } from "./parts";
import { go, stack } from "./route";
import { type BotTemplate, templates } from "./templates-data";

const query = signal("");
const category = signal<string | null>(null);

export const templateBySlug = (slug: string) => templates.find((t) => t.slug === slug);

export function resetTemplates() {
  query.set("");
  category.set(null);
}

const categories = [...new Set(templates.map((t) => t.category))];
const matches = () =>
  templates.filter(
    (t) => (!category() || t.category === category()) && matchesWordPrefixes([t.name, t.category, ...t.integrations].join(" "), query()),
  );

function Chip(props: { name: string | null }) {
  const on = () => category() === props.name;
  return (
    <Button
      selected={on()}
      accessibilityLabel={props.name ?? "All"}
      onPress={() => category.set(props.name)}
      class="min-h-8 items-center justify-center rounded-full bg-secondary px-3.5 selected:bg-primary"
    >
      <Text class={`text-sm ${on() ? "text-primary-foreground" : "text-foreground"}`}>{props.name ?? "All"}</Text>
    </Button>
  );
}

export function Templates() {
  return (
    <View class="gap-4">
      <Input
        accessibilityLabel="Search templates"
        placeholder="Search templates"
        value={query()}
        onChange={({ value }) => query.set(value)}
        class={`${fieldClass} min-h-11 rounded-xl px-4`}
      />
      <View class="flex-row flex-wrap gap-2">
        <Chip name={null} />
        <Each of={categories} key={(c) => c}>
          {(name) => <Chip name={name()} />}
        </Each>
      </View>
      <If when={matches().length > 0} else={<Text class="text-muted-foreground">No templates match your search.</Text>}>
        <Grid>
          <Each of={matches()} key={(t) => t.slug}>
            {(template) => (
              <Cell>
                <Row
                  name={template().name}
                  detail={`${template().category} · ${template().integrations.join(", ")}`}
                  openLabel={`Open ${template().name}`}
                  onOpen={() => go({ name: "template", slug: template().slug })}
                />
              </Cell>
            )}
          </Each>
        </Grid>
      </If>
    </View>
  );
}

/** The app in the catalog a template's app name stands for, when there is one. */
const appNamed = (name: string) => apps.find((a) => a.name.toLowerCase() === name.toLowerCase());

/** Makes a bot from the template and opens its chat; its prompt becomes the bot's instructions. */
function createFromTemplate(template: BotTemplate) {
  const color = botColors[templates.indexOf(template) % botColors.length];
  const id = createBot(template.name, color);
  updateBot(id, { instructions: template.prompt });
  integrationsOpen.set(false);
  openChat(id);
}

export function TemplateDetail(props: { template: BotTemplate }) {
  const t = () => props.template;
  return (
    <View class="gap-6">
      <View class="flex-row items-center gap-4">
        <Logo name={t().name} large />
        <View class="min-w-0 flex-1 gap-0.5">
          <Text role="header" class="truncate text-xl font-semibold text-foreground">
            {t().name}
          </Text>
          <Text class="truncate text-muted-foreground">{t().category}</Text>
        </View>
        <TextButton label="Create bot" variant="primary" onPress={() => createFromTemplate(t())} />
      </View>
      <View class="gap-2">
        <Text role="header" class="px-1 text-sm font-medium text-muted-foreground">
          Adds
        </Text>
        <View class="rounded-xl border border-border px-4 py-3">
          <Text class="text-sm text-foreground">{t().prompt}</Text>
        </View>
        <Text class="px-1 text-sm text-muted-foreground">It becomes the bot's instructions.</Text>
      </View>
      <If when={t().integrations.length > 0}>
        <View class="gap-2">
          <Text role="header" class="px-1 text-sm font-medium text-muted-foreground">
            Works with
          </Text>
          <View class="rounded-xl border border-border">
            <Each of={t().integrations} key={(name) => name}>
              {(name) => (
                <View class="flex-row items-center gap-3 px-4 py-3">
                  <Logo name={name()} />
                  <Text class="min-w-0 flex-1 truncate font-medium text-foreground">{name()}</Text>
                  <If when={appNamed(name())}>
                    {(app) => (
                      <If when={isConnected(app().id)}>
                        <Icon name="check" size={16} tone="muted-foreground" />
                      </If>
                    )}
                  </If>
                </View>
              )}
            </Each>
          </View>
        </View>
      </If>
      <View class="flex-row items-center gap-1">
        <Text class="min-w-0 flex-1 text-sm text-muted-foreground">{`Shared by ${t().contributor} on botdirectory.ai`}</Text>
        <Button accessibilityLabel="View listing" onPress={() => void openUrl(t().url)} class="flex-row items-center gap-1">
          <Text class="text-sm text-muted-foreground">View listing</Text>
          <Icon name="arrow-up-right" size={14} tone="muted-foreground" />
        </Button>
      </View>
    </View>
  );
}

// Browse: the search, the category chips, then featured apps, plugins and more apps.
import { openUrl, signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { AppMenu, fieldClass, Icon, MenuRow, TextButton } from "../../components/ui";
import {
  type App,
  appById,
  apps,
  categoryLabel,
  featuredIds,
  installOf,
  matchesPlugin,
  matchesWordPrefixes,
  PLUGIN_CATEGORIES,
  type Plugin,
  plugins,
  recommendedPlugins,
} from "./catalog";
import { AppTile, Cell, Grid, PluginRow, Row, Section } from "./parts";
import { go } from "./route";

/** Chips before the rest go into a menu. */
const CHIP_COUNT = 6;
/** Apps shown before "Show more". */
const PAGE_SIZE = 60;
const SECTION_SIZE = 6;
const SUBMIT_PLUGIN_URL = "https://pairidaeza.example/plugins/submit/";
const OTHER = "other";

const query = signal("");
const category = signal<string | null>(null);
const visibleCount = signal(PAGE_SIZE);
const pluginCount = signal(24);
const searching = () => query().trim().length > 0;

export function resetBrowse() {
  query.set("");
  category.set(null);
  visibleCount.set(PAGE_SIZE);
  pluginCount.set(24);
}

const categoryOf = (name: string | null) => (name === OTHER ? null : name);
const categories = () => PLUGIN_CATEGORIES.filter((c) => plugins.some((p) => p.category === c));
const pluginMatches = () => plugins.filter((p) => (!category() || p.category === categoryOf(category())) && matchesPlugin(p, query()));

/** Without a query the featured apps lead, so the rest leaves them out. */
const visibleApps = () => {
  const needle = query().trim().toLowerCase();
  return needle
    ? apps.filter((a) => a.name.toLowerCase().includes(needle) || a.slug.toLowerCase().includes(needle) || a.id.includes(needle))
    : apps.filter((a) => !featuredIds.includes(a.id));
};
const strongMatches = () => (searching() ? visibleApps().filter((a) => matchesWordPrefixes(a.name, query())) : []);
const weakMatches = () => (searching() ? visibleApps().filter((a) => !matchesWordPrefixes(a.name, query())) : visibleApps());
const rendered = () => weakMatches().slice(0, visibleCount());

function Tiles(props: { of: App[] }) {
  return (
    <Grid>
      <Each of={props.of} key={(a) => a.id}>
        {(app) => (
          <Cell>
            <AppTile app={app()} />
          </Cell>
        )}
      </Each>
    </Grid>
  );
}

function PluginRows(props: { of: Plugin[] }) {
  return (
    <Grid>
      <Each of={props.of} key={(p) => p.source}>
        {(plugin) => (
          <Cell>
            <PluginRow plugin={plugin()} installed={Boolean(installOf(plugin().source))} />
          </Cell>
        )}
      </Each>
    </Grid>
  );
}

function ShowMore(props: { onPress: () => void }) {
  return (
    <View class="mt-4 items-center">
      <TextButton variant="secondary" label="Show more" onPress={props.onPress} />
    </View>
  );
}

function Chip(props: { name: string | null }) {
  const on = () => category() === props.name;
  return (
    <Button
      selected={on()}
      accessibilityLabel={props.name ? categoryLabel(props.name) : "All"}
      onPress={() => {
        category.set(props.name);
        pluginCount.set(24);
      }}
      class="min-h-8 items-center justify-center rounded-full bg-secondary px-3.5 selected:bg-primary"
    >
      <Text class={`text-sm ${on() ? "text-primary-foreground" : "text-foreground"}`}>{props.name ? categoryLabel(props.name) : "All"}</Text>
    </Button>
  );
}

function Chips() {
  const inMenu = () => category() !== null && !(categories().slice(0, CHIP_COUNT) as string[]).includes(category()!);
  return (
    <View class="flex-row flex-wrap gap-2">
      <Chip name={null} />
      <Each of={categories().slice(0, CHIP_COUNT)} key={(c) => c}>
        {(name) => <Chip name={name()} />}
      </Each>
      <If when={categories().length > CHIP_COUNT}>
        <AppMenu
          align="start"
          trigger={
            <View
              role="button"
              accessibilityLabel="More"
              class={`min-h-8 flex-row items-center justify-center gap-1 rounded-full px-3.5 ${inMenu() ? "bg-primary" : "bg-secondary"}`}
            >
              <Text class={`text-sm ${inMenu() ? "text-primary-foreground" : "text-foreground"}`}>{inMenu() ? categoryLabel(category()!) : "More"}</Text>
              <Icon name="chevron-down" size={14} tone={inMenu() ? "primary-foreground" : "foreground"} />
            </View>
          }
        >
          <Each of={categories().slice(CHIP_COUNT)} key={(c) => c}>
            {(name) => <MenuRow icon="list" label={categoryLabel(name())} onSelect={() => category.set(name())} />}
          </Each>
        </AppMenu>
      </If>
    </View>
  );
}

/** The plugins of the chosen category or the search. */
function PluginResults() {
  return (
    <View class="mt-2">
      <PluginRows of={pluginMatches().slice(0, pluginCount())} />
      <If when={pluginCount() < pluginMatches().length}>
        <ShowMore onPress={() => pluginCount.update((n) => n + 24)} />
      </If>
    </View>
  );
}

/** Recommended brands, then the categories that have plugins. */
function PluginSections() {
  const sections = () => {
    const rest = plugins.filter((p) => !p.category);
    return [
      ...categories().map((name) => [name, categoryLabel(name), plugins.filter((p) => p.category === name)] as const),
      ...(rest.length ? [[OTHER, "More", rest] as const] : []),
    ];
  };
  return (
    <>
      <If when={recommendedPlugins().length > 0}>
        <Section title="Recommended">
          <PluginRows of={recommendedPlugins()} />
        </Section>
      </If>
      <Each of={sections()} key={(s) => s[0]}>
        {(section) => (
          <Section
            title={section()[1]}
            action={
              section()[2].length > SECTION_SIZE ? <TextButton variant="ghost" label="View all" onPress={() => category.set(section()[0])} /> : undefined
            }
          >
            <PluginRows of={section()[2].slice(0, SECTION_SIZE)} />
          </Section>
        )}
      </Each>
    </>
  );
}

/** Nothing leaves for the public MCP catalog until the person picks this row. */
function PublicCatalogRow() {
  return (
    <View class="mt-2">
      <Row
        name={`Search MCP servers for “${query().trim()}”`}
        mark={
          <View class="size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
            <Icon name="search" size={16} tone="muted-foreground" />
          </View>
        }
        onOpen={() => go({ name: "mcp", query: query().trim() })}
      />
    </View>
  );
}

export function Browse() {
  const noMatches = () => searching() && visibleApps().length === 0 && pluginMatches().length === 0;
  return (
    <View class="gap-4">
      <Input
        accessibilityLabel="Search apps"
        placeholder="Search apps"
        value={query()}
        onChange={({ value }) => {
          query.set(value);
          visibleCount.set(PAGE_SIZE);
        }}
        class={`${fieldClass} min-h-11 rounded-xl px-4`}
      />
      <If when={categories().length >= 2 || category()}>
        <Chips />
      </If>
      <View>
        <If when={!searching() && !category()}>
          <Tiles of={featuredIds.map((id) => appById(id)!)} />
        </If>
        <If when={noMatches()}>
          <Text class="text-muted-foreground">No apps match your search.</Text>
        </If>
        <If
          when={!searching()}
          else={
            <>
              <If when={!category() && strongMatches().length > 0}>
                <Tiles of={strongMatches()} />
              </If>
              <PluginResults />
              <If when={!category() && rendered().length > 0}>
                <View class="mt-2">
                  <Tiles of={rendered()} />
                </View>
              </If>
              <If when={!category() && rendered().length < weakMatches().length}>
                <ShowMore onPress={() => visibleCount.update((n) => n + PAGE_SIZE)} />
              </If>
              <If when={query().trim().length >= 2 && query().trim().length <= 253 && !category()}>
                <PublicCatalogRow />
              </If>
            </>
          }
        >
          <If when={category()} else={<PluginSections />}>
            <PluginResults />
          </If>
          <If when={!category() && visibleApps().length > 0}>
            <Section title="More apps">
              <Tiles of={rendered()} />
            </Section>
          </If>
          <If when={!category() && rendered().length < visibleApps().length}>
            <ShowMore onPress={() => visibleCount.update((n) => n + PAGE_SIZE)} />
          </If>
        </If>
        <If when={!category()}>
          <View class="mt-10 items-center">
            <Button accessibilityLabel="Submit a plugin" onPress={() => void openUrl(SUBMIT_PLUGIN_URL)} class="flex-row items-center gap-1">
              <Text class="text-sm text-muted-foreground">Submit a plugin</Text>
              <Icon name="arrow-up-right" size={14} tone="muted-foreground" />
            </Button>
          </View>
        </If>
      </View>
    </View>
  );
}

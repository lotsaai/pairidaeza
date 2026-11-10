// The ways to add something: a plugin from GitHub, a custom source, and the public MCP catalog.
import { signal, Text, View } from "nsh";
import { Collapsible, Input } from "nsh/base";
import { SelectField } from "../../components/settings";
import { Field, fieldClass, Icon, TextButton } from "../../components/ui";
import { addServer, addSource, type Preset, presets, previewGithub, searchMcp, servers, type SourceKind } from "./catalog";
import { Row } from "./parts";
import { go, showManage } from "./route";

const github = signal("");
const githubError = signal(false);

/** Previewing a plugin from its GitHub URL; the URL stays while the overlay is open. */
export function GithubImport() {
  const preview = () => {
    const source = github().trim();
    if (!source) return;
    githubError.set(!previewGithub(source));
    if (!githubError()) go({ name: "plugin", source: source.replace(/\/$/, "") });
  };
  return (
    <View class="max-w-xl gap-4">
      <Field label="Plugin GitHub URL">
        <Input
          accessibilityLabel="Plugin GitHub URL"
          placeholder="https://github.com/owner/plugin"
          value={github()}
          onChange={({ value }) => {
            github.set(value);
            githubError.set(false);
          }}
          onSubmit={preview}
          autoFocus
          class={fieldClass}
        />
      </Field>
      <If when={githubError()}>
        <Text role="alert" class="text-destructive">
          Could not preview plugin
        </Text>
      </If>
      <View class="items-start">
        <TextButton variant="primary" label="Preview" disabled={!github().trim()} onPress={preview} />
      </View>
    </View>
  );
}

type AuthType = "none" | "bearer" | "header";
const authItems = [
  { value: "none", title: "No authentication" },
  { value: "bearer", title: "Bearer token" },
  { value: "header", title: "API key header" },
];
const sourceName = signal("");
const sourceUrl = signal("");
const credential = signal("");
const authType = signal<AuthType>("none");
const authName = signal("x-api-key");
const sourceError = signal(false);

/** Opens the form for a custom MCP, OpenAPI or GraphQL source; each start fills the fields afresh. */
export function beginSource(kind: SourceKind, preset?: Preset) {
  sourceName.set(preset?.name ?? "");
  sourceUrl.set(preset?.url ?? "");
  credential.set("");
  authType.set(preset ? "bearer" : "none");
  authName.set("x-api-key");
  sourceError.set(false);
  go({ name: "source", kind, preset });
}

const placeholders = { mcp: "https://example.com/mcp", graphql: "https://example.com/graphql", api: "https://example.com/openapi.json" };
const fallbackNames = { mcp: "Custom connector", graphql: "GraphQL", api: "Custom connector" };

/** The fields of a custom MCP, OpenAPI, or GraphQL connector. */
export function SourceForm(props: { kind: SourceKind; preset?: Preset }) {
  const custom = () => !props.preset;
  const add = () => {
    if (!sourceUrl().trim()) return sourceError.set(true);
    addSource(sourceName().trim() || (props.preset?.name ?? fallbackNames[props.kind]), props.kind, sourceUrl().trim());
    credential.set("");
    showManage();
  };
  return (
    <View class="max-w-xl gap-4">
      <Field label="Name">
        <Input
          accessibilityLabel="Name"
          value={sourceName()}
          onChange={({ value }) => sourceName.set(value)}
          autoFocus
          class={fieldClass}
        />
      </Field>
      <If when={!props.preset?.url}>
        <Field label="URL">
          <Input
            accessibilityLabel="URL"
            value={sourceUrl()}
            onChange={({ value }) => {
              sourceUrl.set(value);
              sourceError.set(false);
            }}
            placeholder={props.preset?.urlPlaceholder ?? placeholders[props.kind]}
            class={fieldClass}
          />
        </Field>
      </If>
      <If when={custom()}>
        <Field label="Authentication">
          <SelectField label="Authentication" items={authItems} value={authType()} onChange={(v) => authType.set(v as AuthType)} />
        </Field>
      </If>
      <If when={custom() && authType() === "header"}>
        <Field label="Header name">
          <Input accessibilityLabel="Header name" value={authName()} onChange={({ value }) => authName.set(value)} class={fieldClass} />
        </Field>
      </If>
      <If when={!custom() || authType() !== "none"}>
        <Field label={props.preset ? "Bearer token" : "Credential"}>
          <Input
            accessibilityLabel={props.preset ? "Bearer token" : "Credential"}
            masked
            value={credential()}
            onChange={({ value }) => credential.set(value)}
            class={fieldClass}
          />
          <Text class="text-sm text-muted-foreground">Credentials are encrypted and never sent to the model.</Text>
        </Field>
      </If>
      <If when={sourceError()}>
        <Text role="alert" class="text-destructive">
          Could not install connector
        </Text>
      </If>
      <View class="items-start">
        <TextButton variant="primary" label="Verify and add" onPress={add} />
      </View>
    </View>
  );
}

const mcpQuery = signal("");
const mcpResults = signal<{ name: string; endpoint: string }[]>([]);
const mcpSearched = signal(false);
const mcpUrl = signal("");
const mcpUrlOpen = signal(false);

const searchRemote = (text: string) => {
  mcpResults.set(searchMcp(text));
  mcpSearched.set(true);
};

/** Searches the public MCP catalog once on open when `initialQuery` is given. */
export function openMcpBrowse(initialQuery?: string) {
  mcpQuery.set(initialQuery ?? "");
  mcpResults.set([]);
  mcpSearched.set(false);
  mcpUrl.set("");
  if (initialQuery?.trim()) searchRemote(initialQuery);
  go({ name: "mcp", query: initialQuery });
}

/** Connecting completes at once: the server's own sign-in page is not reachable here. */
const connect = (name: string, endpoint: string) => {
  addServer(name, endpoint);
};

export function McpBrowse() {
  return (
    <View class="gap-6">
      <Text role="header" class="text-lg font-medium text-foreground">
        Add MCP server
      </Text>
      <View class="flex-row gap-2">
        <Input
          accessibilityLabel="Search apps"
          placeholder="Search apps"
          value={mcpQuery()}
          onChange={({ value }) => mcpQuery.set(value)}
          onSubmit={() => mcpQuery().trim() && searchRemote(mcpQuery())}
          class={`${fieldClass} min-w-0 flex-1`}
        />
        <TextButton
          variant="primary"
          label="Search integrations.sh"
          disabled={!mcpQuery().trim()}
          onPress={() => searchRemote(mcpQuery())}
        />
      </View>
      <Each of={mcpResults()} key={(r) => r.endpoint}>
        {(result) => (
          <Row name={result().name}>
            <TextButton
              variant="secondary"
              label={servers().some((server) => server.endpoint === result().endpoint) ? "Connected" : "Connect"}
              disabled={servers().some((server) => server.endpoint === result().endpoint)}
              accessibilityLabel={`Connect ${result().name}`}
              onPress={() => connect(result().name, result().endpoint)}
            />
          </Row>
        )}
      </Each>
      <If when={mcpSearched() && mcpResults().length === 0}>
        <Text class="text-muted-foreground">No remote MCP servers found</Text>
      </If>
      <Collapsible
        open={mcpUrlOpen()}
        content={
          <View class="gap-3 pt-3">
            <Input
              accessibilityLabel="Server URL"
              value={mcpUrl()}
              onChange={({ value }) => mcpUrl.set(value)}
              placeholder="https://example.com/mcp"
              class={fieldClass}
            />
            <View class="items-start">
              <TextButton
                variant="primary"
                label="Connect"
                disabled={!mcpUrl().trim()}
                onPress={() => connect("MCP server", mcpUrl().trim())}
              />
            </View>
          </View>
        }
      >
        <View
          role="button"
          accessibilityLabel="Add server URL"
          onPress={() => mcpUrlOpen.update((o) => !o)}
          class="flex-row items-center gap-1"
        >
          <Text class="text-muted-foreground">Add server URL</Text>
          <Icon name={mcpUrlOpen() ? "chevron-down" : "chevron-right"} size={14} tone="muted-foreground" />
        </View>
      </Collapsible>
    </View>
  );
}

/** The sources the + menu offers first: a custom MCP server, OpenAPI, GraphQL, then the presets. */
export const sourceChoices = (): { label: string; kind: SourceKind; preset?: Preset }[] => [
  { label: "MCP server", kind: "mcp" },
  { label: "OpenAPI", kind: "api" },
  { label: "GraphQL", kind: "graphql" },
  ...presets().map((preset) => ({ label: preset.name, kind: "mcp" as const, preset })),
];

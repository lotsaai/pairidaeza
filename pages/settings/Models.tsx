import { signal, Text, View } from "nsh";
import { AlertDialog, Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow } from "../../components/settings";
import { Field, fieldClass, TextButton } from "../../components/ui";
import { apiSignal } from "../../api";

type Provider = { id: string; name: string; model: string; label: string };
type Connection = { id: string; provider: string; name: string; maxTokens: string; model?: string; baseUrl?: string };

const providers = apiSignal<Provider[]>("models", "providers", []);
const connections = apiSignal<Connection[]>("models", "connections", []);
const mainModel = apiSignal("models", "mainModel", "");
const approvalModel = apiSignal("models", "approvalModel", "");
const computerModel = apiSignal("models", "computerModel", "");
const active = signal("");
const draftName = signal("");
const key = signal("");
const serverUrl = signal("");
const customModel = signal("");
const protocol = signal("chat-completions");
const advanced = signal(false);
const tokenLimit = signal("");
const provider = (id: string) => providers().find((item) => item.id === id);
const selectedConnection = () => connections().find((item) => item.id === active());
const selectedProvider = () => provider(selectedConnection()?.provider ?? active());
const modelItems = () =>
  connections().flatMap((connection) => {
    const entry = provider(connection.provider);
    return entry && (entry.model || connection.model)
      ? [{ value: connection.id, title: `${entry.label || connection.model} (${connection.name})` }]
      : [];
  });

function openConnection(id: string) {
  const connection = connections().find((item) => item.id === id);
  active.set(id);
  draftName.set(connection?.name ?? "");
  tokenLimit.set(connection?.maxTokens ?? "");
  key.set("");
  serverUrl.set(connection?.baseUrl ?? (id === "ollama-cloud" ? "https://ollama.com/v1" : ""));
  customModel.set(connection?.model ?? "");
  advanced.set(false);
}

async function disconnect() {
  const connection = selectedConnection();
  if (!connection) return;
  const result = await AlertDialog.show({
    title: `Disconnect ${connection.name}?`,
    description: "This removes the connection from every space.",
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Disconnect", role: "destructive", id: "yes" },
    ],
  });
  if (result.action !== "yes") return;
  connections.update((items) => items.filter((item) => item.id !== connection.id));
  if (mainModel() === connection.id) mainModel.set("");
  if (approvalModel() === connection.id) approvalModel.set("");
  if (computerModel() === connection.id) computerModel.set("same");
  active.set("");
}

function Role(props: { title: string; value: string; onChange: (value: string) => void; same?: boolean }) {
  return (
    <SettingsGroup title={props.title}>
      <SettingsRow
        first
        label={props.title}
        control={
          <SelectField
            label={props.title}
            items={
              props.same
                ? [{ value: "same", title: "Same as main model" }, ...modelItems()]
                : [{ value: "choose", title: "Choose a model" }, ...modelItems()]
            }
            value={props.value || "choose"}
            onChange={props.onChange}
            searchable
          />
        }
      />
    </SettingsGroup>
  );
}

export function ModelsSettings() {
  return (
    <>
      <Role title="Main model" value={mainModel()} onChange={(value) => mainModel.set(value)} />
      <Role title="Approval model" value={approvalModel()} onChange={(value) => approvalModel.set(value)} />
      <Role title="Computer-use model" value={computerModel()} onChange={(value) => computerModel.set(value)} same />
      <SettingsGroup title="Providers">
        <Each of={connections()} key={(connection) => connection.id}>
          {(connection, index) => (
            <SettingsRow
              first={index() === 0}
              label={connection().name}
              control={<TextButton label={`Manage ${connection().name}`} variant="ghost" onPress={() => openConnection(connection().id)} />}
            />
          )}
        </Each>
        <SettingsRow
          first={connections().length === 0}
          label="Add provider"
          control={
            <SelectField
              label="Add provider"
              items={[{ value: "add", title: "Add provider" }, ...providers().map((item) => ({ value: item.id, title: item.name }))]}
              value={selectedConnection() ? "add" : active() || "add"}
              onChange={(value) => {
                if (value !== "add") openConnection(value);
              }}
              searchable
            />
          }
        />
      </SettingsGroup>
      <If when={selectedProvider()}>
        {(entry) => (
          <SettingsGroup title={selectedConnection()?.name ?? `Connect ${entry().name}`}>
            <View class="gap-4 p-4">
              <If when={selectedConnection()}>
                <View class="gap-4">
                  <Field label="Name">
                    <Input
                      class={fieldClass}
                      accessibilityLabel="Name"
                      value={draftName()}
                      onChange={({ value }) => draftName.set(value)}
                    />
                  </Field>
                  <TextButton
                    label="Save"
                    onPress={() =>
                      connections.update((items) =>
                        items.map((item) =>
                          item.id === active() && draftName().trim()
                            ? {
                                ...item,
                                name: draftName().trim(),
                                maxTokens: tokenLimit(),
                                model: customModel() || item.model,
                                baseUrl: serverUrl() || item.baseUrl,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
              </If>
              <If when={entry().id === "openai-compatible" || entry().id === "ollama-cloud"}>
                <Field label="Server URL">
                  <Input
                    class={fieldClass}
                    accessibilityLabel="Server URL"
                    value={serverUrl()}
                    onChange={({ value }) => serverUrl.set(value)}
                  />
                </Field>
                <SettingsRow
                  first
                  label="Protocol"
                  control={
                    <SelectField
                      label="Protocol"
                      value={protocol()}
                      onChange={(value) => protocol.set(value)}
                      items={[
                        { value: "chat-completions", title: "Chat Completions" },
                        { value: "responses", title: "Responses" },
                        { value: "anthropic-messages", title: "Anthropic Messages" },
                      ]}
                    />
                  }
                />
                <Field label="Model">
                  <Input
                    class={fieldClass}
                    accessibilityLabel="Model id"
                    value={customModel()}
                    onChange={({ value }) => customModel.set(value)}
                    placeholder="exact-model-id"
                  />
                </Field>
              </If>
              <Field label={selectedConnection() ? "Replace API key" : "API key"}>
                <Input
                  class={fieldClass}
                  accessibilityLabel={selectedConnection() ? "Replace API key" : "API key"}
                  masked
                  value={key()}
                  onChange={({ value }) => key.set(value)}
                  placeholder="sk-…"
                />
              </Field>
              <TextButton
                label={selectedConnection() ? "Replace API key" : "Connect API key"}
                onPress={() => {
                  const compatible = entry().id === "openai-compatible" || entry().id === "ollama-cloud";
                  if ((!compatible || entry().id === "ollama-cloud") && key().trim().length < 8) return;
                  if (compatible && (!serverUrl().trim() || !customModel().trim())) return;
                  if (!selectedConnection())
                    connections.update((items) => [
                      ...items,
                      {
                        id: `${entry().id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        provider: entry().id,
                        name: entry().name,
                        maxTokens: tokenLimit(),
                        ...(compatible ? { model: customModel().trim(), baseUrl: serverUrl().trim() } : {}),
                      },
                    ]);
                  // The mock validates the key but does not store it.
                  key.set("");
                  active.set("");
                }}
              />
              <TextButton label="Advanced" variant="ghost" onPress={() => advanced.update((value) => !value)} />
              <If when={advanced()}>
                <Field label="Maximum output tokens">
                  <Input
                    class={fieldClass}
                    accessibilityLabel="Maximum output tokens"
                    value={tokenLimit()}
                    onChange={({ value }) => tokenLimit.set(value)}
                  />
                </Field>
              </If>
              <If when={selectedConnection()}>
                <TextButton label="Disconnect" variant="ghost" onPress={() => void disconnect()} />
              </If>
              <TextButton
                label="Close"
                variant="ghost"
                onPress={() => {
                  active.set("");
                  key.set("");
                }}
              />
            </View>
          </SettingsGroup>
        )}
      </If>
      <If when={providers().length === 0}>
        <Text class="text-sm text-muted-foreground">No model catalog is available.</Text>
      </If>
    </>
  );
}

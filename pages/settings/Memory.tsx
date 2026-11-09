import { signal, Text, View } from "nsh";
import { Button, Input } from "nsh/base";
import { Segmented, SelectField, SettingsGroup } from "../../components/settings";
import { Field, fieldClass, TextButton } from "../../components/ui";

type Provider = "supermemory" | "serenity" | "honcho";
type Scope = "isolated" | "shared";
type Mode = "cloud" | "local";

const provider = signal<Provider>("supermemory");
const connected = signal<{ name: string; detail: string } | null>(null);
const adding = signal(false);
const scope = signal<Scope>("isolated");
const mode = signal<Mode>("cloud");
const baseUrl = signal("");
const apiKey = signal("");
const workspace = signal("");
const userPeer = signal("");
const endpoint = signal("");
const endpointError = signal(false);
const brainLabel = signal("");
const allowWrites = signal<"recall" | "write">("recall");
const resourceId = /^[a-zA-Z0-9_-]{1,512}$/;

function ready() {
  if (apiKey().trim().length < 8) return false;
  if (provider() === "serenity") return true;
  if (mode() === "local" && !baseUrl().trim()) return false;
  if (provider() !== "honcho") return true;
  const peer = userPeer().trim();
  return resourceId.test(workspace().trim()) && resourceId.test(peer) && peer !== "pairidaeza-shared" && !peer.startsWith("bot-");
}

function connect() {
  if (!ready()) return;
  if (provider() === "serenity" && !endpoint().trim()) {
    endpointError.set(true);
    return;
  }
  const detail =
    provider() === "serenity"
      ? `${brainLabel().trim() || endpoint().trim()}, ${allowWrites() === "write" ? "read/write" : "recall only"}`
      : provider() === "honcho"
        ? `${mode() === "cloud" ? "Honcho Cloud" : `Self-hosted (${baseUrl().trim()})`}${mode() === "cloud" ? ` (${workspace().trim()})` : `, ${workspace().trim()}`}`
        : mode() === "cloud"
          ? "Supermemory Cloud"
          : `Self-hosted (${baseUrl().trim()})`;
  const name = provider() === "honcho" ? "Honcho" : provider() === "serenity" ? "Serenity" : "Supermemory";
  connected.set({ name, detail });
  apiKey.set("");
}

function ScopePicker() {
  return (
    <Field label="Default scope">
      <Segmented
        options={[
          { value: "isolated", label: "Isolated" },
          { value: "shared", label: "Shared" },
        ]}
        value={scope()}
        onChange={(value) => scope.set(value)}
      />
    </Field>
  );
}

export function MemorySettings() {
  return (
    <If
      when={connected()}
      else={
        <If
          when={adding()}
          else={
            <View class="items-start">
              <TextButton label="Connect memory provider" onPress={() => adding.set(true)} />
            </View>
          }
        >
          <SettingsGroup>
            <View class="gap-4 p-4">
              <Field label="Provider">
                <Text class="text-sm text-muted-foreground">Lets bots save and recall facts by meaning.</Text>
                <SelectField
                  label="Provider"
                  items={[
                    { value: "supermemory", title: "Supermemory" },
                    { value: "serenity", title: "Serenity" },
                    { value: "honcho", title: "Honcho" },
                  ]}
                  value={provider()}
                  onChange={(value) => {
                    if (value === "supermemory" || value === "serenity" || value === "honcho") {
                      provider.set(value);
                      mode.set("cloud");
                      baseUrl.set("");
                      apiKey.set("");
                    }
                  }}
                />
              </Field>
              <ScopePicker />
              <If when={provider() !== "serenity"}>
                <Field label="Connection">
                  <Segmented
                    options={[
                      { value: "cloud", label: "Cloud" },
                      { value: "local", label: "Self-hosted" },
                    ]}
                    value={mode()}
                    onChange={(value) => mode.set(value)}
                  />
                </Field>
                <If when={mode() === "local"}>
                  <Field label="Base URL">
                    <Input
                      accessibilityLabel="Base URL"
                      class={fieldClass}
                      value={baseUrl()}
                      onChange={(e) => baseUrl.set(e.value)}
                      placeholder="https://…"
                    />
                  </Field>
                </If>
              </If>
              <If when={provider() === "serenity"}>
                <Field label="MCP endpoint">
                  <Input
                    accessibilityLabel="MCP endpoint"
                    class={fieldClass}
                    value={endpoint()}
                    onChange={(e) => {
                      endpoint.set(e.value);
                      endpointError.set(false);
                    }}
                    placeholder="https://serenity.sire.run/mcp"
                  />
                  <If when={endpointError()}>
                    <Text class="text-sm text-destructive">Serenity endpoint is required.</Text>
                  </If>
                </Field>
              </If>
              <Field
                label={
                  provider() === "serenity"
                    ? "Bearer token"
                    : provider() === "honcho"
                      ? "API key"
                      : mode() === "cloud"
                        ? "Organization API key"
                        : "Instance API key"
                }
              >
                <Input
                  accessibilityLabel={
                    provider() === "serenity"
                      ? "Bearer token"
                      : provider() === "honcho"
                        ? "API key"
                        : mode() === "cloud"
                          ? "Organization API key"
                          : "Instance API key"
                  }
                  class={fieldClass}
                  masked
                  value={apiKey()}
                  onChange={(e) => apiKey.set(e.value)}
                  placeholder={
                    provider() === "serenity" ? "sk_live_…" : provider() === "honcho" ? (mode() === "cloud" ? "hch-…" : "") : "sm_…"
                  }
                />
              </Field>
              <If when={provider() === "serenity"}>
                <Field label="Brain label">
                  <Input
                    accessibilityLabel="Brain label"
                    class={fieldClass}
                    value={brainLabel()}
                    onChange={(e) => brainLabel.set(e.value)}
                    placeholder="personal"
                  />
                </Field>
                <Field label="Allow writing">
                  <Segmented
                    options={[
                      { value: "recall", label: "Recall only" },
                      { value: "write", label: "Recall and write" },
                    ]}
                    value={allowWrites()}
                    onChange={(value) => allowWrites.set(value)}
                  />
                </Field>
              </If>
              <If when={provider() === "honcho"}>
                <Field label="Workspace">
                  <Input
                    accessibilityLabel="Workspace"
                    class={fieldClass}
                    value={workspace()}
                    onChange={(e) => workspace.set(e.value)}
                    placeholder="pairidaeza-<space>"
                    maxLength={512}
                  />
                  <If when={!resourceId.test(workspace().trim())}>
                    <Text class="text-sm text-destructive">Use up to 512 letters, digits, _ or -.</Text>
                  </If>
                </Field>
                <If when={workspace().trim().length > 0}>
                  <Field label="User peer">
                    <Input
                      accessibilityLabel="User peer"
                      class={fieldClass}
                      value={userPeer()}
                      onChange={(e) => userPeer.set(e.value)}
                      maxLength={512}
                    />
                    <Text class="text-sm text-muted-foreground">Recall from this peer; save to Pairidaeza’s own peers.</Text>
                    <If when={!resourceId.test(userPeer().trim())}>
                      <Text class="text-sm text-destructive">Use up to 512 letters, digits, _ or -.</Text>
                    </If>
                    <If
                      when={
                        resourceId.test(userPeer().trim()) &&
                        (userPeer().trim() === "pairidaeza-shared" || userPeer().trim().startsWith("bot-"))
                      }
                    >
                      <Text class="text-sm text-destructive">
                        pairidaeza-shared and IDs starting with bot- are reserved for Pairidaeza.
                      </Text>
                    </If>
                  </Field>
                </If>
              </If>
              <View class="items-start">
                <Button
                  disabled={!ready()}
                  onPress={connect}
                  class="min-h-8 items-center justify-center rounded-full border border-border bg-background px-4 py-1.5 disabled:opacity-50"
                >
                  <Text class="text-sm font-medium text-foreground">Connect</Text>
                </Button>
              </View>
            </View>
          </SettingsGroup>
        </If>
      }
    >
      {(connection) => (
        <SettingsGroup>
          <View class="gap-4 p-4">
            <View class="flex-row items-center justify-between">
              <Text class="font-medium text-foreground">{connection().name}</Text>
              <Text class="text-sm text-muted-foreground">Connected</Text>
            </View>
            <Text class="text-sm text-muted-foreground">{connection().detail}</Text>
            <ScopePicker />
            <View class="items-start">
              <TextButton
                label="Disconnect"
                onPress={() => {
                  connected.set(null);
                  adding.set(false);
                }}
              />
            </View>
          </View>
        </SettingsGroup>
      )}
    </If>
  );
}

import { signal, Text, View } from "nsh";
import { AlertDialog, Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow } from "../../components/settings";
import { Field, fieldClass, TextButton } from "../../components/ui";

type Provider = { id: string; name: string; model: string; label: string };
type Connection = { id: string; provider: string; name: string; maxTokens: string; model?: string; baseUrl?: string };

// Names and model IDs come from the bundled provider registry.
const providers: Provider[] = [
  { id: "openai-codex", name: "OpenAI Codex", model: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "anthropic", name: "Anthropic", model: "claude-fable-5", label: "Claude Fable 5" },
  { id: "openai", name: "OpenAI", model: "chat-latest", label: "Chat Latest" },
  { id: "openrouter", name: "OpenRouter", model: "~anthropic/claude-fable-latest", label: "Anthropic: Claude Fable Latest" },
  { id: "google", name: "Google", model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "amazon-bedrock", name: "Amazon Bedrock", model: "amazon.nova-2-lite-v1:0", label: "Nova 2 Lite" },
  { id: "ant-ling", name: "Ant Ling", model: "Ling-2.6-1T", label: "Ling 2.6 1T" },
  { id: "azure", name: "Azure OpenAI", model: "chat-latest", label: "Chat Latest" },
  { id: "baseten", name: "Baseten", model: "deepseek-ai/DeepSeek-V4-Flash-0731", label: "DeepSeek V4 Flash 0731" },
  { id: "cerebras", name: "Cerebras", model: "gpt-oss-120b", label: "GPT OSS 120B" },
  { id: "cloudflare-ai-gateway", name: "Cloudflare AI Gateway", model: "claude-fable-5", label: "Claude Fable 5" },
  { id: "cloudflare-workers-ai", name: "Cloudflare Workers AI", model: "@cf/deepseek-ai/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash 0731" },
  { id: "deepseek", name: "DeepSeek", model: "deepseek-flash", label: "DeepSeek V4.1 Flash" },
  { id: "fireworks", name: "Fireworks", model: "accounts/fireworks/models/deepseek-v4p1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "github-copilot", name: "GitHub Copilot", model: "claude-fable-5", label: "Claude Fable 5" },
  { id: "google-vertex", name: "Google Vertex AI", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "groq", name: "Groq", model: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b" },
  { id: "huggingface", name: "Hugging Face", model: "deepseek-ai/DeepSeek-R1", label: "DeepSeek-R1" },
  { id: "kimi-coding", name: "Kimi For Coding", model: "k3", label: "Kimi K3" },
  { id: "meta", name: "Meta", model: "muse-spark-1.1", label: "Muse Spark 1.1" },
  { id: "minimax", name: "MiniMax", model: "MiniMax-M3", label: "MiniMax-M3" },
  { id: "minimax-cn", name: "MiniMax CN", model: "MiniMax-M2.7", label: "MiniMax-M2.7" },
  { id: "mistral", name: "Mistral", model: "codestral-2508", label: "Codestral 25.08" },
  { id: "moonshotai", name: "Moonshot AI", model: "kimi-k2.6", label: "Kimi K2.6" },
  { id: "moonshotai-cn", name: "Moonshot AI CN", model: "kimi-k2.6", label: "Kimi K2.6" },
  { id: "nvidia", name: "NVIDIA", model: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "opencode", name: "OpenCode Zen", model: "claude-fable-5", label: "Claude Fable 5" },
  { id: "opencode-go", name: "OpenCode Go", model: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "qwen-token-plan", name: "Qwen Token Plan", model: "deepseek-v3.2", label: "DeepSeek V3.2" },
  { id: "qwen-token-plan-cn", name: "Qwen Token Plan CN", model: "deepseek-v3.2", label: "DeepSeek V3.2" },
  { id: "qwen-token-plan-individual", name: "Qwen Token Plan Individual", model: "deepseek-v4-flash-0731", label: "DeepSeek V4 Flash 0731" },
  { id: "radius", name: "Radius", model: "balanced", label: "Balanced" },
  { id: "together", name: "Together", model: "deepseek-ai/DeepSeek-V4-Pro-0813", label: "DeepSeek V4 Pro 0813" },
  { id: "vercel-ai-gateway", name: "Vercel AI Gateway", model: "alibaba/qwen-3-14b", label: "Qwen3-14B" },
  { id: "xai", name: "xAI", model: "grok-4.3", label: "Grok 4.3" },
  { id: "xiaomi", name: "Xiaomi", model: "mimo-v2.6-flash", label: "MiMo-V2.6-Flash" },
  { id: "xiaomi-token-plan-ams", name: "Xiaomi Token Plan AMS", model: "mimo-v2.6-flash", label: "MiMo-V2.6-Flash" },
  { id: "xiaomi-token-plan-cn", name: "Xiaomi Token Plan CN", model: "mimo-v2.6-flash", label: "MiMo-V2.6-Flash" },
  { id: "xiaomi-token-plan-sgp", name: "Xiaomi Token Plan SGP", model: "mimo-v2.6-flash", label: "MiMo-V2.6-Flash" },
  { id: "zai", name: "Z.AI", model: "glm-4.7", label: "GLM-4.7" },
  { id: "zai-coding-cn", name: "Z.AI Coding CN", model: "glm-4.6v", label: "GLM-4.6V" },
  { id: "openai-compatible", name: "OpenAI-compatible", model: "", label: "" },
  { id: "ollama-cloud", name: "Ollama Cloud", model: "", label: "" },
];
const connections = signal<Connection[]>([
  { id: "anthropic-1", provider: "anthropic", name: "Anthropic", maxTokens: "" },
  { id: "openai-1", provider: "openai", name: "OpenAI", maxTokens: "" },
]);
const mainModel = signal("anthropic-1");
const approvalModel = signal("openai-1");
const computerModel = signal("same");
const active = signal("");
const draftName = signal("");
const key = signal("");
const serverUrl = signal("");
const customModel = signal("");
const protocol = signal("chat-completions");
const advanced = signal(false);
const tokenLimit = signal("");
let nextId = 2;

const provider = (id: string) => providers.find((item) => item.id === id);
const selectedConnection = () => connections().find((item) => item.id === active());
const selectedProvider = () => provider(selectedConnection()?.provider ?? active());
const modelItems = () => connections().flatMap((connection) => {
  const entry = provider(connection.provider);
  return entry && (entry.model || connection.model) ? [{ value: connection.id, title: `${entry.label || connection.model} (${connection.name})` }] : [];
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
    actions: [{ label: "Cancel", role: "cancel", id: "cancel" }, { label: "Disconnect", role: "destructive", id: "yes" }],
  });
  if (result.action !== "yes") return;
  connections.update((items) => items.filter((item) => item.id !== connection.id));
  if (mainModel() === connection.id) mainModel.set("");
  if (approvalModel() === connection.id) approvalModel.set("");
  if (computerModel() === connection.id) computerModel.set("same");
  active.set("");
}

function Role(props: { title: string; value: string; onChange: (value: string) => void; same?: boolean }) {
  return <SettingsGroup title={props.title}>
    <SettingsRow first label={props.title} control={<SelectField label={props.title} items={props.same ? [{ value: "same", title: "Same as main model" }, ...modelItems()] : [{ value: "choose", title: "Choose a model" }, ...modelItems()]} value={props.value || "choose"} onChange={props.onChange} searchable />} />
  </SettingsGroup>;
}

export function ModelsSettings() {
  return <>
    <Role title="Main model" value={mainModel()} onChange={(value) => mainModel.set(value)} />
    <Role title="Approval model" value={approvalModel()} onChange={(value) => approvalModel.set(value)} />
    <Role title="Computer-use model" value={computerModel()} onChange={(value) => computerModel.set(value)} same />
    <SettingsGroup title="Providers">
      <Each of={connections()} key={(connection) => connection.id}>
        {(connection, index) => <SettingsRow first={index() === 0} label={connection().name} control={<TextButton label={`Manage ${connection().name}`} variant="ghost" onPress={() => openConnection(connection().id)} />} />}
      </Each>
      <SettingsRow first={connections().length === 0} label="Add provider" control={<SelectField label="Add provider" items={[{ value: "add", title: "Add provider" }, ...providers.map((item) => ({ value: item.id, title: item.name }))]} value={selectedConnection() ? "add" : active() || "add"} onChange={(value) => { if (value !== "add") openConnection(value); }} searchable />} />
    </SettingsGroup>
    <If when={selectedProvider()}>
      {(entry) => <SettingsGroup title={selectedConnection()?.name ?? `Connect ${entry().name}`}>
        <View class="gap-4 p-4">
          <If when={selectedConnection()}>
            <View class="gap-4">
              <Field label="Name"><Input class={fieldClass} accessibilityLabel="Name" value={draftName()} onChange={({ value }) => draftName.set(value)} /></Field>
              <TextButton label="Save" onPress={() => connections.update((items) => items.map((item) => item.id === active() && draftName().trim() ? { ...item, name: draftName().trim(), maxTokens: tokenLimit(), model: customModel() || item.model, baseUrl: serverUrl() || item.baseUrl } : item))} />
            </View>
          </If>
          <If when={entry().id === "openai-compatible" || entry().id === "ollama-cloud"}>
            <Field label="Server URL"><Input class={fieldClass} accessibilityLabel="Server URL" value={serverUrl()} onChange={({ value }) => serverUrl.set(value)} /></Field>
            <SettingsRow first label="Protocol" control={<SelectField label="Protocol" value={protocol()} onChange={(value) => protocol.set(value)} items={[{ value: "chat-completions", title: "Chat Completions" }, { value: "responses", title: "Responses" }, { value: "anthropic-messages", title: "Anthropic Messages" }]} />} />
            <Field label="Model"><Input class={fieldClass} accessibilityLabel="Model id" value={customModel()} onChange={({ value }) => customModel.set(value)} placeholder="exact-model-id" /></Field>
          </If>
          <Field label={selectedConnection() ? "Replace API key" : "API key"}><Input class={fieldClass} accessibilityLabel={selectedConnection() ? "Replace API key" : "API key"} masked value={key()} onChange={({ value }) => key.set(value)} placeholder="sk-…" /></Field>
          <TextButton label={selectedConnection() ? "Replace API key" : "Connect API key"} onPress={() => {
            const compatible = entry().id === "openai-compatible" || entry().id === "ollama-cloud";
            if ((!compatible || entry().id === "ollama-cloud") && key().trim().length < 8) return;
            if (compatible && (!serverUrl().trim() || !customModel().trim())) return;
            if (!selectedConnection()) connections.update((items) => [...items, { id: `${entry().id}-${nextId++}`, provider: entry().id, name: entry().name, maxTokens: tokenLimit(), ...(compatible ? { model: customModel().trim(), baseUrl: serverUrl().trim() } : {}) }]);
            key.set("");
            active.set("");
          }} />
          <TextButton label="Advanced" variant="ghost" onPress={() => advanced.update((value) => !value)} />
          <If when={advanced()}><Field label="Maximum output tokens"><Input class={fieldClass} accessibilityLabel="Maximum output tokens" value={tokenLimit()} onChange={({ value }) => tokenLimit.set(value)} /></Field></If>
          <If when={selectedConnection()}><TextButton label="Disconnect" variant="ghost" onPress={() => void disconnect()} /></If>
          <TextButton label="Close" variant="ghost" onPress={() => { active.set(""); key.set(""); }} />
        </View>
      </SettingsGroup>}
    </If>
    <If when={providers.length === 0}><Text class="text-sm text-muted-foreground">No model catalog is available.</Text></If>
  </>;
}

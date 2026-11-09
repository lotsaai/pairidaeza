import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow } from "../../components/settings";
import { fieldClass, TextButton } from "../../components/ui";

const providers = [
  { value: "macos", title: "Server (Mac)" },
  { value: "elevenlabs", title: "ElevenLabs" },
  { value: "openai", title: "OpenAI" },
  { value: "cartesia", title: "Cartesia" },
  { value: "fish-audio", title: "Fish Audio" },
  { value: "openai-compatible", title: "Self-hosted" },
];
const openAiVoices = [
  { value: "alloy", title: "Alloy (Neutral)" },
  { value: "ash", title: "Ash (Clear)" },
  { value: "ballad", title: "Ballad (Warm)" },
  { value: "cedar", title: "Cedar" },
  { value: "coral", title: "Coral (Bright)" },
  { value: "echo", title: "Echo (Even)" },
  { value: "fable", title: "Fable (Narrative)" },
  { value: "marin", title: "Marin" },
  { value: "onyx", title: "Onyx (Deep)" },
  { value: "nova", title: "Nova (Energetic)" },
  { value: "sage", title: "Sage (Calm)" },
  { value: "shimmer", title: "Shimmer (Soft)" },
  { value: "verse", title: "Verse (Expressive)" },
];
const provider = signal("openai");
const connected = signal<string[]>(["openai"]);
const apiKey = signal("");
const serverUrl = signal("");
const speechModel = signal("");
const ttsModel = signal("");
const sttModel = signal("");
const voice = signal<Record<string, string>>({ openai: "alloy", "openai-compatible": "af_heart" });
const playing = signal(false);

export function VoiceSettings() {
  const isConnected = () => connected().includes(provider());
  const selfHosted = () => provider() === "openai-compatible";
  const keyless = () => provider() === "macos";
  const connect = () => {
    if (!keyless() && (selfHosted() ? !serverUrl().trim() : apiKey().trim().length < 8)) return;
    connected.update((items) => (items.includes(provider()) ? items : [...items, provider()]));
    apiKey.set("");
  };
  const disconnect = () => {
    connected.update((items) => items.filter((item) => item !== provider()));
    apiKey.set("");
  };
  return (
    <SettingsGroup>
      <SettingsRow
        first
        label="Provider"
        control={
          <SelectField
            label="Provider"
            value={provider()}
            items={providers.map((item) => ({ ...item, title: `${item.title}${connected().includes(item.value) ? " (Connected)" : ""}` }))}
            onChange={(value) => {
              provider.set(value);
              apiKey.set("");
            }}
          />
        }
      />
      <If when={selfHosted()}>
        <SettingsRow label="Server URL">
          <Input
            accessibilityLabel="Server URL"
            class={fieldClass}
            value={serverUrl()}
            onChange={({ value }) => serverUrl.set(value)}
            placeholder="http://192.168.1.10:8880/v1"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </SettingsRow>
      </If>
      <If when={!keyless()}>
        <SettingsRow label="API key">
          <Input
            accessibilityLabel="API key"
            class={fieldClass}
            masked
            value={apiKey()}
            onChange={({ value }) => apiKey.set(value)}
            placeholder={selfHosted() ? "Optional" : isConnected() ? "Paste a replacement key" : "Paste your API key"}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </SettingsRow>
      </If>
      <If when={selfHosted()}>
        <SettingsRow label="Speech model">
          <Input
            accessibilityLabel="Speech model"
            class={fieldClass}
            value={ttsModel()}
            onChange={({ value }) => ttsModel.set(value)}
            placeholder="mlx-community/Kokoro-82M-bf16"
            maxLength={200}
          />
        </SettingsRow>
        <SettingsRow label="Transcription model">
          <Input
            accessibilityLabel="Transcription model"
            class={fieldClass}
            value={sttModel()}
            onChange={({ value }) => sttModel.set(value)}
            placeholder="mlx-community/whisper-large-v3-turbo-asr-fp16"
            maxLength={200}
          />
        </SettingsRow>
      </If>
      <View class="flex-row flex-wrap gap-2 px-4 py-3">
        <If when={!keyless() || !isConnected()}>
          <TextButton
            variant="primary"
            label={keyless() ? "Turn on" : isConnected() ? (selfHosted() ? "Reconnect" : "Replace key") : "Connect"}
            onPress={connect}
          />
        </If>
        <If when={isConnected()}>
          <TextButton label={keyless() ? "Turn off" : "Disconnect"} onPress={disconnect} />
        </If>
      </View>
      <If when={isConnected()}>
        <If
          when={selfHosted()}
          else={
            <SettingsRow
              label="Voice"
              control={
                <SelectField
                  label="Voice"
                  value={voice()[provider()] ?? ""}
                  items={provider() === "openai" ? openAiVoices : []}
                  onChange={(value) => voice.update((voices) => ({ ...voices, [provider()]: value }))}
                />
              }
            />
          }
        >
          <SettingsRow label="Voice">
            <Input
              accessibilityLabel="Voice"
              class={fieldClass}
              value={voice()[provider()] ?? ""}
              onChange={({ value }) => voice.update((voices) => ({ ...voices, [provider()]: value }))}
            />
          </SettingsRow>
        </If>
        <If when={provider() === "elevenlabs" || provider() === "fish-audio"}>
          <SettingsRow label="Speech model">
            <Input
              accessibilityLabel="Speech model"
              class={fieldClass}
              value={speechModel()}
              onChange={({ value }) => speechModel.set(value)}
              placeholder="Optional"
              maxLength={64}
            />
          </SettingsRow>
        </If>
        <View class="gap-2 px-4 py-3">
          <Text class="text-sm text-muted-foreground">Hi, this is how I'll sound when I read replies out loud.</Text>
          <View class="flex-row">
            <TextButton
              label={playing() ? "Playing…" : "Hear a sample"}
              onPress={() => {
                playing.set(true);
                setTimeout(() => playing.set(false), 1200);
              }}
            />
          </View>
        </View>
      </If>
    </SettingsGroup>
  );
}

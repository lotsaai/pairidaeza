import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow } from "../../components/settings";
import { fieldClass, TextButton } from "../../components/ui";
import { apiSignal } from "../../api";

const providers = apiSignal<{ value: string; title: string }[]>("voice", "providers", []);
const openAiVoices = apiSignal<{ value: string; title: string }[]>("voice", "openAiVoices", []);
const provider = apiSignal("voice", "provider", "");
const connected = apiSignal<string[]>("voice", "connected", []);
const apiKey = signal("");
const serverUrl = apiSignal("voice", "serverUrl", "");
const speechModel = apiSignal("voice", "speechModel", "");
const ttsModel = apiSignal("voice", "ttsModel", "");
const sttModel = apiSignal("voice", "sttModel", "");
const voice = apiSignal<Record<string, string>>("voice", "voice", {});
const playing = signal(false);

export function VoiceSettings() {
  const isConnected = () => connected().includes(provider());
  const selfHosted = () => provider() === "openai-compatible";
  const keyless = () => provider() === "macos";
  const connect = () => {
    if (!keyless() && (selfHosted() ? !serverUrl().trim() : apiKey().trim().length < 8)) return;
    // Credentials are validation-only in this mock and are not stored.
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
            items={providers().map((item) => ({
              ...item,
              title: `${item.title}${connected().includes(item.value) ? " (Connected)" : ""}`,
            }))}
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
                  items={provider() === "openai" ? openAiVoices() : []}
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

import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow, SwitchSetting } from "../../components/settings";
import { Field, fieldClass, IconButton, TextButton } from "../../components/ui";
import { apiSignal } from "../../api";

type ProviderField = { key: string; label: string; secret?: boolean; required?: boolean };
type Provider = { value: string; title: string; fields: ProviderField[] };

const providers = apiSignal<Provider[]>("computer", "providers", []);

const provider = signal("");
const values = signal<Record<string, string>>({});
const storedProvider = apiSignal("computer", "storedProvider", "");
const storedValues = apiSignal<Record<string, string>>("computer", "storedValues", {});
const saved = signal(false);
const allowed = apiSignal("computer", "allowed", false);
const devices = apiSignal<{ id: string; name: string; connected: boolean }[]>("computer", "devices", []);

export function ComputerSettings() {
  provider.set(storedProvider());
  values.set({ ...storedValues() });
  return (
    <>
      <SettingsGroup title="Computers">
        <View class="gap-3 p-4">
          <Field label="New computers run on">
            <SelectField
              label="New computers run on"
              items={providers()}
              value={provider()}
              onChange={(value) => {
                provider.set(value);
                values.set(value === storedProvider() ? { ...storedValues() } : {});
                saved.set(false);
              }}
            />
          </Field>
          <Each of={providers().find((item) => item.value === provider())?.fields ?? []} key={(field) => field.key}>
            {(field) => (
              <Field label={field().label}>
                <Input
                  class={fieldClass}
                  accessibilityLabel={field().label}
                  masked={field().secret}
                  autoComplete={field().secret ? "off" : undefined}
                  value={values()[field().key] ?? ""}
                  onChange={({ value }) => {
                    values.update((current) => ({ ...current, [field().key]: value }));
                    saved.set(false);
                  }}
                />
              </Field>
            )}
          </Each>
          <View class="flex-row items-center gap-3">
            <TextButton
              label="Save"
              variant="primary"
              onPress={() => {
                const fields = providers().find((item) => item.value === provider())?.fields ?? [];
                if (fields.some((field) => field.required && !values()[field.key]?.trim())) return;
                storedProvider.set(provider());
                // The mock does not persist credentials; configure a secure secret store for real providers.
                storedValues.set(
                  Object.fromEntries(
                    Object.entries(values()).filter(([key]) => !fields.some((field) => field.key === key && field.secret)),
                  ),
                );
                saved.set(true);
              }}
            />
            <If when={saved()}>
              <Text class="text-sm text-muted-foreground">Saved</Text>
            </If>
          </View>
        </View>
      </SettingsGroup>
      <SettingsGroup title="My computers">
        <SwitchSetting first label="Let bots use this computer" checked={allowed()} onChange={(value) => allowed.set(value)} />
        <Each of={devices()} key={(device) => device.id}>
          {(device) => (
            <SettingsRow
              label={device().name}
              detail={device().connected ? "Connected" : "Offline"}
              control={
                <IconButton
                  icon="trash"
                  label={`Remove ${device().name}`}
                  onPress={() => devices.update((current) => current.filter((item) => item.id !== device().id))}
                />
              }
            />
          )}
        </Each>
      </SettingsGroup>
    </>
  );
}

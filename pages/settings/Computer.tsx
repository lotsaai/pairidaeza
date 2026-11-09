import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow, SwitchSetting } from "../../components/settings";
import { Field, fieldClass, IconButton, TextButton } from "../../components/ui";

type ProviderField = { key: string; label: string; secret?: boolean; required?: boolean };
type Provider = { value: string; title: string; fields: ProviderField[] };

const apiKey: ProviderField = { key: "apiKey", label: "API key", secret: true, required: true };
const providers: Provider[] = [
  { value: "default", title: "Deployment default (docker)", fields: [] },
  {
    value: "wuying",
    title: "Wuying",
    fields: [
      { key: "desktopId", label: "Desktop ID", required: true },
      { key: "endUserId", label: "End user ID", required: true },
      { key: "regionId", label: "Region" },
      { key: "accessKeyId", label: "Access key ID", secret: true, required: true },
      { key: "accessKeySecret", label: "Access key secret", secret: true, required: true },
      { key: "mcpUrl", label: "Gateway URL", required: true },
      { key: "mcpToken", label: "Gateway token", secret: true, required: true },
    ],
  },
  { value: "e2b", title: "E2B", fields: [apiKey] },
  { value: "novita", title: "Novita", fields: [apiKey, { key: "template", label: "Template" }] },
  { value: "daytona", title: "Daytona", fields: [apiKey, { key: "apiUrl", label: "API URL" }, { key: "target", label: "Target" }] },
  {
    value: "createos",
    title: "CreateOS",
    fields: [apiKey, { key: "baseUrl", label: "API URL" }, { key: "shape", label: "Shape" }, { key: "rootfs", label: "Root filesystem" }],
  },
  { value: "boat", title: "Boat", fields: [apiKey, { key: "apiUrl", label: "API URL" }] },
  { value: "boxd", title: "Boxd", fields: [apiKey, { key: "org", label: "Organization" }] },
  {
    value: "railway",
    title: "Railway",
    fields: [
      { key: "apiToken", label: "API token", secret: true, required: true },
      { key: "environmentId", label: "Environment ID", required: true },
      { key: "region", label: "Region" },
    ],
  },
];

const provider = signal("default");
const values = signal<Record<string, string>>({});
const storedProvider = signal("default");
const storedValues = signal<Record<string, string>>({});
const saved = signal(false);
const allowed = signal(true);
const devices = signal([
  { id: "mac", name: "MacBook Pro", connected: true },
  { id: "desktop", name: "Desktop", connected: false },
]);

export function ComputerSettings() {
  return (
    <>
      <SettingsGroup title="Computers">
        <View class="gap-3 p-4">
          <Field label="New computers run on">
            <SelectField
              label="New computers run on"
              items={providers}
              value={provider()}
              onChange={(value) => {
                provider.set(value);
                values.set(value === storedProvider() ? { ...storedValues() } : {});
                saved.set(false);
              }}
            />
          </Field>
          <Each of={providers.find((item) => item.value === provider())?.fields ?? []} key={(field) => field.key}>
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
                const fields = providers.find((item) => item.value === provider())?.fields ?? [];
                if (fields.some((field) => field.required && !values()[field.key]?.trim())) return;
                storedProvider.set(provider());
                storedValues.set({ ...values() });
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

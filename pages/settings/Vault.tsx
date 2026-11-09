import { signal, Text, View } from "nsh";
import { AlertDialog, Button, Input } from "nsh/base";
import { SelectField, SettingsGroup, SettingsRow } from "../../components/settings";
import { AppMenu, Field, fieldClass, MenuRow, TextButton } from "../../components/ui";

type Kind = "login" | "card" | "contact" | "api_key" | "variable";
type LoginField = { id: number; label: string; value: string; hidden: boolean };
type Item = { id: string; kind: Kind; title: string; fields: Record<string, string>; login: LoginField[] };
type Draft = Item & { editing: boolean; noteShown: boolean };

const kinds: { value: Kind; label: string; plural: string; heading: string }[] = [
  { value: "login", label: "Login", plural: "Logins", heading: "New login" },
  { value: "card", label: "Card", plural: "Cards", heading: "New card" },
  { value: "contact", label: "Contact", plural: "Contacts", heading: "New contact" },
  { value: "api_key", label: "API key", plural: "Keys", heading: "New API key" },
  { value: "variable", label: "Variable", plural: "Variables", heading: "New variable" },
];
const defaults = (): LoginField[] => [
  { id: 1, label: "Username", value: "", hidden: false },
  { id: 2, label: "Password", value: "", hidden: true },
];
const items = signal<Item[]>([
  { id: "1", kind: "login", title: "example.com", fields: { Site: "https://www.example.com" }, login: [{ id: 1, label: "Username", value: "alex@example.com", hidden: false }, { id: 2, label: "Password", value: "example-password", hidden: true }] },
  { id: "2", kind: "card", title: "Card •••• 4242", fields: { "Card number": "4242424242424242", Expiry: "12/28", "Security code": "123", "Name on card": "Alex Morgan", "Billing address": "3" }, login: [] },
  { id: "3", kind: "contact", title: "Home", fields: { "Full name": "Alex Morgan", Address: "123 Main Street", City: "New York", "State or region": "NY", "ZIP or postal code": "10001", Country: "United States", Email: "alex@example.com" }, login: [] },
  { id: "4", kind: "api_key", title: "api.example.com", fields: { Site: "https://api.example.com", Type: "bearer", Value: "example-api-key" }, login: [] },
  { id: "5", kind: "variable", title: "DEPLOY_TOKEN", fields: { "Variable name": "DEPLOY_TOKEN", Value: "example-token" }, login: [] },
]);
const query = signal("");
const filter = signal("all");
const opened = signal<string | null>(null);
const draft = signal<Draft | null>(null);
const revealed = signal(false);
let hideTimer: number | undefined;
let nextId = 6;
let nextFieldId = 3;

const current = () => items().find((item) => item.id === opened());
const shown = () => items().filter((item) => {
  const needle = query().trim().toLowerCase();
  return (filter() === "all" || item.kind === filter()) && (!needle || [item.title, item.fields.Site, item.fields["Variable name"], item.login.find((f) => !f.hidden)?.value].some((v) => v?.toLowerCase().includes(needle)));
});
function hide() { revealed.set(false); clearTimeout(hideTimer); }
function toggleReveal() {
  if (revealed()) { hide(); return; }
  revealed.set(true);
  hideTimer = setTimeout(hide, 30000);
}
function start(kind: Kind, item?: Item) {
  hide();
  draft.set({ id: item?.id ?? String(nextId++), kind, title: item?.title ?? "", fields: { Type: "bearer", ...item?.fields }, login: item ? item.login.map((field) => ({ ...field })) : defaults(), editing: !!item, noteShown: !!item?.fields["When to use"] });
}
function updateField(label: string, value: string) {
  draft.update((d) => d ? { ...d, fields: { ...d.fields, [label]: value } } : d);
}
function updateLogin(id: number, change: Partial<LoginField>) {
  draft.update((d) => d ? { ...d, login: d.login.map((field) => field.id === id ? { ...field, ...change } : field) } : d);
}
function save() {
  const d = draft();
  if (!d) return;
  const title = d.title.trim() || (d.kind === "contact" ? d.fields["Full name"] : d.kind === "card" ? `Card •••• ${(d.fields["Card number"] ?? "").slice(-4)}` : d.kind === "variable" ? d.fields["Variable name"] : (d.fields.Site ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
  if (!title || (d.kind === "login" && (!d.fields.Site || !d.login.length || d.login.some((f) => !f.label.trim() || !f.value))) || (d.kind === "api_key" && (!d.fields.Site || !d.fields.Value || (d.fields.Type === "header" && !d.fields["Header name"]) || (d.fields.Type === "basic" && !d.fields.Username))) || (d.kind === "variable" && (!d.fields["Variable name"] || !d.fields.Value)) || (d.kind === "card" && (!d.fields["Card number"] || !d.fields.Expiry || !d.fields["Security code"] || !d.fields["Name on card"]))) return;
  const item: Item = { id: d.id, kind: d.kind, title, fields: d.fields, login: d.login };
  items.update((all) => d.editing ? all.map((entry) => entry.id === d.id ? item : entry) : [...all, item]);
  draft.set(null);
}
async function remove(item: Item) {
  hide();
  const { action } = await AlertDialog.show({ title: `Remove ${item.title}?`, description: "Bots will no longer be able to use it.", actions: [{ label: "Cancel", role: "cancel", id: "cancel" }, { label: "Remove", role: "destructive", id: "yes" }] });
  if (action === "yes") { items.update((all) => all.filter((entry) => entry.id !== item.id)); opened.set(null); }
}
function FormField(props: { label: string; placeholder?: string; masked?: boolean; readonly?: boolean }) {
  return <Field label={props.label}><Input class={fieldClass} accessibilityLabel={props.label} placeholder={props.placeholder} masked={props.masked} readonly={props.readonly} value={draft()?.fields[props.label] ?? ""} onChange={({ value }) => updateField(props.label, value)} /></Field>;
}
function Editor() {
  return <View class="gap-4">
    <View class="flex-row items-center gap-3"><TextButton label="Back" variant="ghost" onPress={() => draft.set(null)} /><Text class="text-base font-medium text-foreground">{draft()?.editing ? draft()?.title : kinds.find((kind) => kind.value === draft()?.kind)?.heading}</Text></View>
    <If when={draft()?.kind === "contact"}><Field label="Label"><Input class={fieldClass} accessibilityLabel="Label" placeholder="Home" value={draft()?.title ?? ""} onChange={({ value }) => draft.update((d) => d ? { ...d, title: value } : d)} /></Field></If>
    <If when={draft()?.editing && draft()?.kind !== "contact"}><Field label="Name"><Input class={fieldClass} accessibilityLabel="Name" value={draft()?.title ?? ""} onChange={({ value }) => draft.update((d) => d ? { ...d, title: value } : d)} /></Field></If>
    <If when={draft()?.kind === "login"}>
      <FormField label="Site" placeholder="https://www.example.com" readonly={draft()?.editing} />
      <Each of={draft()?.login ?? []} key={(field) => field.id}>{(field) => <View class="flex-row flex-wrap items-center gap-2">
        <Input class={`${fieldClass} w-32`} accessibilityLabel="Label" placeholder="Label" value={field().label} onChange={({ value }) => updateLogin(field().id, { label: value })} />
        <Input class={`${fieldClass} min-w-32 flex-1`} accessibilityLabel={field().label || "Value"} value={field().value} masked={field().hidden} onChange={({ value }) => updateLogin(field().id, { value })} />
        <TextButton label={field().hidden ? "Unhide" : "Hide"} variant="ghost" onPress={() => updateLogin(field().id, { hidden: !field().hidden })} />
        <If when={(draft()?.login.length ?? 0) > 1}><TextButton label="Remove" variant="ghost" onPress={() => draft.update((d) => d ? { ...d, login: d.login.filter((f) => f.id !== field().id) } : d)} /></If>
      </View>}</Each>
      <If when={(draft()?.login.length ?? 0) < 8}><TextButton label="Add field" variant="ghost" onPress={() => draft.update((d) => d ? { ...d, login: [...d.login, { id: nextFieldId++, label: "", value: "", hidden: true }] } : d)} /></If>
    </If>
    <If when={draft()?.kind === "card"}>
      <FormField label="Card number" /><FormField label="Expiry" placeholder="MM/YY" /><FormField label="Security code" masked /><FormField label="Name on card" />
      <If when={items().some((item) => item.kind === "contact")}><Field label="Billing address"><SelectField label="Billing address" items={[{ value: "none", title: "None" }, ...items().filter((item) => item.kind === "contact").map((item) => ({ value: item.id, title: item.title }))]} value={draft()?.fields["Billing address"] || "none"} onChange={(value) => updateField("Billing address", value === "none" ? "" : value)} /></Field></If>
    </If>
    <If when={draft()?.kind === "contact"}><FormField label="Full name" /><FormField label="Address" /><FormField label="Address line 2" /><FormField label="City" /><FormField label="State or region" /><FormField label="ZIP or postal code" /><FormField label="Country" /><FormField label="Phone" /><FormField label="Email" /></If>
    <If when={draft()?.kind === "api_key"}>
      <FormField label="Site" placeholder="https://api.example.com" readonly={draft()?.editing} />
      <Field label="Type"><SelectField label="Type" items={[{ value: "bearer", title: "Bearer token" }, { value: "header", title: "Custom header" }, { value: "basic", title: "Basic auth" }]} value={draft()?.fields.Type ?? "bearer"} onChange={(value) => { if (!draft()?.editing) updateField("Type", value); }} /></Field>
      <If when={draft()?.fields.Type === "header"}><FormField label="Header name" placeholder="X-Api-Key" readonly={draft()?.editing} /></If>
      <If when={draft()?.fields.Type === "basic"}><FormField label="Username" readonly={draft()?.editing} /></If><FormField label="Value" masked />
    </If>
    <If when={draft()?.kind === "variable"}><FormField label="Variable name" placeholder="DEPLOY_TOKEN" readonly={draft()?.editing} /><If when={draft()?.fields["Variable name"]}><Text class="text-sm text-muted-foreground">Available to shell commands as ${draft()?.fields["Variable name"]?.toUpperCase()}</Text></If><FormField label="Value" masked /></If>
    <If when={draft()?.noteShown} else={<TextButton label="Add a note" variant="ghost" onPress={() => draft.update((d) => d ? { ...d, noteShown: true } : d)} />}><FormField label="When to use" /></If>
    <View class="flex-row justify-end"><TextButton label="Save" variant="primary" onPress={save} /></View>
  </View>;
}
function Detail() {
  return <If when={current()}>{(item) => <View class="gap-4">
    <View class="flex-row items-center gap-3"><TextButton label="Back" variant="ghost" onPress={() => { hide(); opened.set(null); }} /><View><Text class="text-base font-medium text-foreground">{item().title}</Text><Text class="text-sm text-muted-foreground">{kinds.find((kind) => kind.value === item().kind)?.label}</Text></View></View>
    <SettingsGroup>
      <If when={item().fields.Site}><SettingsRow first label="Site" detail={item().fields.Site} /></If>
      <If when={item().kind === "login"}><Each of={item().login} key={(field) => field.id}>{(field) => <SettingsRow label={field().label} detail={field().hidden && !revealed() ? "••••••••" : field().value} control={field().hidden ? <TextButton label={revealed() ? "Hide" : "Show"} variant="ghost" onPress={toggleReveal} /> : undefined} />}</Each></If>
      <If when={item().kind === "card"}><SettingsRow first label="Number" detail={revealed() ? item().fields["Card number"] : `•••• ${(item().fields["Card number"] ?? "").slice(-4)}`} control={<TextButton label={revealed() ? "Hide" : "Show"} variant="ghost" onPress={toggleReveal} />} /><SettingsRow label="Expires" detail={item().fields.Expiry} /><SettingsRow label="Security code" detail={revealed() ? item().fields["Security code"] : "•••"} /><SettingsRow label="Name on card" detail={item().fields["Name on card"]} /><If when={item().fields["Billing address"]}><SettingsRow label="Billing address" detail={items().find((contact) => contact.id === item().fields["Billing address"])?.title} /></If></If>
      <If when={item().kind === "contact"}><Each of={["Full name", "Address", "Address line 2", "City", "State or region", "ZIP or postal code", "Country", "Phone", "Email"].filter((label) => item().fields[label])}>{(label, index) => <SettingsRow first={index() === 0} label={label()} detail={item().fields[label()]} />}</Each></If>
      <If when={item().kind === "api_key"}><SettingsRow label="Type" detail={item().fields.Type === "header" ? `Header \"${item().fields["Header name"]}\"` : item().fields.Type === "basic" ? `Basic auth (${item().fields.Username})` : "Bearer token"} /></If>
      <If when={item().kind === "variable"}><SettingsRow first label="Variable" detail={`$${item().fields["Variable name"]}`} /></If>
      <If when={item().kind === "api_key" || item().kind === "variable"}><SettingsRow label="Value" detail={revealed() ? item().fields.Value : "••••••••"} control={<TextButton label={revealed() ? "Hide" : "Show"} variant="ghost" onPress={toggleReveal} />} /></If>
      <If when={item().fields["When to use"]}><SettingsRow label="When to use" detail={item().fields["When to use"]} /></If>
    </SettingsGroup>
    <View class="flex-row justify-between"><TextButton label="Edit" onPress={() => start(item().kind, item())} /><Button onPress={() => void remove(item())} class="min-h-8 justify-center px-4"><Text class="text-sm font-medium text-destructive">Remove</Text></Button></View>
  </View>}</If>;
}
export function VaultSettings() {
  return <If when={draft()} else={<If when={opened()} else={<View class="gap-4">
    <View class="flex-row flex-wrap items-center gap-2"><SelectField label="Show" items={[{ value: "all", title: "All" }, ...kinds.map((kind) => ({ value: kind.value, title: kind.plural }))]} value={filter()} onChange={filter.set} /><Input class={`${fieldClass} min-w-32 flex-1`} accessibilityLabel="Search Vault" placeholder="Search" value={query()} onChange={({ value }) => query.set(value)} /><AppMenu trigger={<TextButton label="New" variant="primary" />}><MenuRow icon="key-round" label="New login" onSelect={() => start("login")} /><MenuRow icon="key-round" label="New card" onSelect={() => start("card")} /><MenuRow icon="user-round" label="New contact" onSelect={() => start("contact")} /><MenuRow icon="key-round" label="New API key" onSelect={() => start("api_key")} /><MenuRow icon="key-round" label="New variable" onSelect={() => start("variable")} /></AppMenu></View>
    <If when={shown().length} else={<Text class="py-6 text-center text-sm text-muted-foreground">No matches</Text>}><SettingsGroup><Each of={shown()} key={(item) => item.id}>{(item, index) => <SettingsRow first={index() === 0} label={item().title} detail={`${kinds.find((kind) => kind.value === item().kind)?.label} · ${item().kind === "card" ? `•••• ${(item().fields["Card number"] ?? "").slice(-4)}` : item().kind === "variable" ? `$${item().fields["Variable name"]}` : item().kind === "login" ? item().login.find((field) => !field.hidden)?.value ?? "••••••••" : item().kind === "contact" ? item().fields["Full name"] ?? "" : "••••••••"}`} control={<TextButton label="Show" variant="ghost" onPress={() => { hide(); opened.set(item().id); }} />} />}</Each></SettingsGroup></If>
  </View>}><Detail /></If>}><Editor /></If>;
}

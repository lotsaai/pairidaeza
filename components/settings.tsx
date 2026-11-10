// Settings building blocks: titled groups of rows, each a label with its control at the end.
import { type JSX, Text, View } from "nsh";
import { Select, Switch, Toggle, ToggleGroup } from "nsh/base";
import { Icon, popupClass } from "./ui";

/** A titled list of rows on one bordered surface; `action` sits at the end of the title. */
export function SettingsGroup(props: { title?: string; action?: JSX.Element; children: JSX.Element }) {
  return (
    <View class="gap-2">
      <If when={props.title}>
        {(title) => (
          <View class="min-h-6 flex-row items-center justify-between gap-3 px-1">
            <Text role="header" class="font-medium text-foreground">
              {title()}
            </Text>
            {props.action}
          </View>
        )}
      </If>
      <View class="overflow-hidden rounded-xl border border-border">{props.children}</View>
    </View>
  );
}

/** One setting: label (and a muted line under it) then its control, wrapping below when they do not fit. */
export function SettingsRow(props: { label: string; detail?: string; control?: JSX.Element; children?: JSX.Element; first?: boolean }) {
  return (
    <View class={`gap-2 px-4 py-3 ${props.first ? "" : "border-t border-border"}`}>
      <View class="min-h-9 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <View class="min-w-0 shrink gap-0.5">
          <Text class="text-foreground">{props.label}</Text>
          <If when={props.detail}>{(d) => <Text class="text-sm text-muted-foreground">{d()}</Text>}</If>
        </View>
        <If when={props.control}>
          <View class="max-w-full min-w-0 flex-row items-center gap-2">{props.control}</View>
        </If>
      </View>
      {props.children}
    </View>
  );
}

/** One of a few options side by side, the chosen one raised. */
export function Segmented<V extends string>(props: { options: { value: V; label: string }[]; value: V; onChange: (value: V) => void }) {
  return (
    <ToggleGroup class="flex-row gap-1 rounded-lg bg-muted p-1">
      <Each of={props.options} key={(o) => o.value}>
        {(option) => (
          <Toggle
            pressed={props.value === option().value}
            onChange={() => props.onChange(option().value)}
            class="group min-h-8 justify-center rounded-md px-3 hover:bg-accent aria-pressed:bg-background aria-pressed:shadow-sm aria-pressed:shadow-shadow-color"
          >
            <Text class="text-sm text-muted-foreground group-aria-pressed:font-medium group-aria-pressed:text-foreground">
              {option().label}
            </Text>
          </Toggle>
        )}
      </Each>
    </ToggleGroup>
  );
}

/** A value chosen from a list: a popup on desktops, a sheet on phones. */
export function SelectField(props: {
  label: string;
  items: { value: string; title: string }[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const title = () => props.items.find((i) => i.value === props.value)?.title ?? "";
  return (
    <Select
      items={props.items}
      value={props.value}
      onChange={({ value }) => value && props.onChange(value)}
      accessibilityLabel={props.label}
      searchable={props.searchable}
      searchPlaceholder="Search"
      offset={4}
      popupClass={`${popupClass} max-h-80`}
      backdropClass="bg-overlay"
      itemClass="rounded-md px-2.5 py-1.5 text-sm text-popover-foreground focus:bg-accent selected:font-medium"
      searchClass="mb-1 min-h-9 rounded-md border border-input px-2.5 text-sm text-foreground"
      trigger={
        <View class="h-9 w-56 flex-row items-center justify-between gap-2 rounded-lg border border-input px-3 hover:bg-accent">
          <Text class="line-clamp-1 min-w-0 shrink text-sm text-foreground">{title()}</Text>
          <Icon name="chevron-down" size={16} tone="muted-foreground" />
        </View>
      }
    />
  );
}

/** A setting that takes effect at once: its row's label names the switch. */
export function SwitchSetting(props: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  first?: boolean;
}) {
  return (
    <SettingsRow
      first={props.first}
      label={props.label}
      detail={props.detail}
      control={
        <Switch
          checked={props.checked}
          accessibilityLabel={props.label}
          onChange={({ checked }) => props.onChange(checked)}
          trackClass="h-6 w-10 rounded-full bg-input p-0.5 checked:bg-primary"
          thumbClass="size-5 rounded-full bg-background shadow-sm shadow-shadow-color checked:translate-x-4"
        />
      }
    />
  );
}

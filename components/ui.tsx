// The app's styled layer over nsh/base: icons, buttons, avatars and the shared popup surface.
import { Image, type JSX, Text, type Tokens, token, View } from "nsh";
import { Button, ContextMenu, Menu, MenuItem, MenuSeparator, Radio, RadioGroup, Submenu, Switch } from "nsh/base";
import type { Bot } from "../store";
import { type IconName, icons } from "./icons";

export type { IconName };

/** A Lucide icon tinted with a theme color (or `color`, for a color that is data). */
export function Icon(props: { name: IconName; size?: number; tone?: keyof Tokens; color?: string }) {
  return (
    <Image
      src={icons[props.name]}
      style={{
        pointerEvents: "none",
        width: props.size ?? 20,
        height: props.size ?? 20,
        tintColor: props.color ?? (token(props.tone ?? "foreground") as string),
      }}
    />
  );
}

/** A round, icon-only toolbar button; `floating` ones sit on a card over content. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  filled?: boolean;
  floating?: boolean;
  disabled?: boolean;
  /** A toggle that is on, or a mode that is showing. */
  selected?: boolean;
}) {
  return (
    <Button
      accessibilityLabel={props.label}
      disabled={props.disabled}
      selected={props.selected}
      onPress={props.onPress}
      class={`${props.floating ? "size-10" : "size-9"} items-center justify-center rounded-full disabled:opacity-40 ${props.filled ? "bg-primary active:bg-primary/80" : `${props.floating ? "bg-card " : ""}hover:bg-accent active:bg-accent selected:bg-accent`}`}
    >
      <Icon
        name={props.icon}
        size={props.floating ? 17 : 18}
        tone={props.filled ? "primary-foreground" : props.selected ? "foreground" : "muted-foreground"}
      />
    </Button>
  );
}

const buttonVariants = {
  primary: { box: "bg-primary active:bg-primary/80", label: "text-primary-foreground" },
  default: { box: "border border-border bg-background hover:bg-accent active:bg-accent", label: "text-foreground" },
  secondary: { box: "bg-secondary active:bg-secondary/70", label: "text-secondary-foreground" },
  destructive: { box: "bg-destructive active:bg-destructive/80", label: "text-destructive-foreground" },
  ghost: { box: "hover:bg-accent active:bg-accent", label: "text-foreground" },
} as const;

/** A labeled button in one of the app's variants. */
export function TextButton(props: {
  label: string;
  variant?: keyof typeof buttonVariants;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const variant = () => buttonVariants[props.variant ?? "default"];
  return (
    <Button
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      onPress={props.onPress}
      class={`min-h-8 items-center justify-center rounded-full px-4 py-1.5 disabled:opacity-40 ${variant().box}`}
    >
      <Text class={`text-sm font-medium ${variant().label}`}>{props.label}</Text>
    </Button>
  );
}

/** A bot's round face in its identity color. */
export function BotFace(props: { bot: Bot; size?: number }) {
  const size = () => props.size ?? 40;
  return (
    <View
      style={{ width: size(), height: size(), borderRadius: size() / 2, backgroundColor: props.bot.color, gap: size() / 8 }}
      class="flex-row items-center justify-center"
    >
      <View class="bg-(--bot-eye)" style={{ width: size() / 12, height: size() / 5, borderRadius: size() / 24 }} />
      <View class="bg-(--bot-eye)" style={{ width: size() / 12, height: size() / 5, borderRadius: size() / 24 }} />
    </View>
  );
}

/** One face, or a small cluster of faces for a group chat. */
export function ChatAvatar(props: { bots: Bot[]; size?: number }) {
  const size = () => props.size ?? 40;
  return (
    <If when={props.bots.length > 1} else={<BotFace bot={props.bots[0]} size={size()} />}>
      <View style={{ width: size(), height: size() }}>
        <View class="absolute top-0" style={{ left: size() / 4 }}>
          <BotFace bot={props.bots[0]} size={size() / 2} />
        </View>
        <View class="absolute bottom-0 left-0">
          <BotFace bot={props.bots[1]} size={size() / 2} />
        </View>
        <If when={props.bots[2]}>
          {(bot) => (
            <View class="absolute right-0 bottom-0">
              <BotFace bot={bot()} size={size() / 2} />
            </View>
          )}
        </If>
      </View>
    </If>
  );
}

/** The popup surface menus, popovers and sheets share. */
export const popupClass = "min-w-48 rounded-(--radius) border border-border bg-popover p-1 shadow-lg shadow-shadow-color";

/** A section title in panels and settings. */
export function SectionTitle(props: { children: JSX.Element }) {
  return (
    <Text role="header" class="px-1 text-sm font-medium text-muted-foreground">
      {props.children}
    </Text>
  );
}

const menuBackdrop = "bg-overlay";

/** A menu opened by `trigger`: a popup on desktops, a sheet on phones, in the app's popup surface. */
export function AppMenu(props: {
  trigger: JSX.Element;
  children: JSX.Element;
  align?: "start" | "center" | "end";
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Menu
      trigger={props.trigger}
      align={props.align}
      offset={4}
      popupClass={popupClass}
      backdropClass={menuBackdrop}
      onOpenChange={props.onOpenChange && (({ open }) => props.onOpenChange?.(open))}
    >
      {props.children}
    </Menu>
  );
}

/** A menu opened by a right click on desktops or a held finger on phones. */
export function AppContextMenu(props: { trigger: JSX.Element; children: JSX.Element }) {
  return (
    <ContextMenu trigger={props.trigger} popupClass={popupClass} backdropClass={menuBackdrop}>
      {props.children}
    </ContextMenu>
  );
}

const menuRowClass = "flex-row items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-accent focus:bg-accent active:bg-accent";

/** One menu row: an icon, its label and an optional muted detail; `destructive` rows read in the destructive color. */
export function MenuRow(props: {
  icon: IconName;
  label: string;
  detail?: string;
  onSelect: () => void;
  destructive?: boolean;
  class?: string;
}) {
  return (
    <MenuItem onSelect={props.onSelect} class={`${menuRowClass} ${props.class ?? ""}`}>
      <Icon name={props.icon} size={16} tone={props.destructive ? "destructive" : "muted-foreground"} />
      <Text class={`flex-1 text-sm ${props.destructive ? "text-destructive" : "text-popover-foreground"}`}>{props.label}</Text>
      <If when={props.detail}>{(detail) => <Text class="text-xs text-muted-foreground tabular-nums">{detail()}</Text>}</If>
    </MenuItem>
  );
}

/** A row opening more items: beside the menu on desktops, in place of its items on phones. */
export function SubmenuRow(props: { icon: IconName; label: string; children: JSX.Element }) {
  return (
    <Submenu
      offset={4}
      trigger={
        <View class={menuRowClass}>
          <Icon name={props.icon} size={16} tone="muted-foreground" />
          <Text class="flex-1 text-sm text-popover-foreground">{props.label}</Text>
          <Icon name="chevron-right" size={14} tone="muted-foreground" />
        </View>
      }
      back={
        <View class={menuRowClass}>
          <Icon name="chevron-left" size={16} tone="muted-foreground" />
          <Text class="text-sm font-medium text-popover-foreground">{props.label}</Text>
        </View>
      }
    >
      {props.children}
    </Submenu>
  );
}

export function MenuDivider() {
  return <MenuSeparator class="my-1 h-px bg-border" />;
}

/** The account's round initial. */
export function AccountAvatar(props: { name: string; size?: number }) {
  const size = () => props.size ?? 32;
  return (
    <View class="items-center justify-center rounded-full bg-primary" style={{ width: size(), height: size() }}>
      <Text class="text-sm font-medium text-primary-foreground">{props.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** The text field look the app's forms share. */
export const fieldClass = "min-h-10 rounded-(--radius) border border-input px-3 text-foreground placeholder:text-muted-foreground";

/** A labeled form field. */
export function Field(props: { label: string; children: JSX.Element }) {
  return (
    <View class="gap-1.5">
      <Text class="text-sm font-medium text-foreground">{props.label}</Text>
      {props.children}
    </View>
  );
}

/** A setting that turns on or off at once, its label before the switch. */
export function SwitchRow(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Switch
      checked={props.checked}
      onChange={({ checked }) => props.onChange(checked)}
      class="flex-row-reverse items-center justify-between gap-3"
      trackClass="h-5 w-9 rounded-full bg-input p-0.5 checked:bg-primary"
      thumbClass="size-4 rounded-full bg-background checked:translate-x-4"
    >
      <Text class="flex-1 text-foreground">{props.label}</Text>
    </Switch>
  );
}

/** One choice among a few, each with a line saying what it does. */
export function Choices<V extends string>(props: {
  options: { value: V; label: string; description?: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <RadioGroup class="gap-1">
      <Each of={props.options} key={(o) => o.value}>
        {(option) => (
          <Radio
            checked={props.value === option().value}
            onChange={() => props.onChange(option().value)}
            class="group flex-row items-start gap-3 rounded-(--radius) p-2 hover:bg-accent"
          >
            <View class="mt-0.5 size-4 items-center justify-center rounded-full border border-input group-checked:border-primary">
              <View class="size-2 rounded-full group-checked:bg-primary" />
            </View>
            <View class="flex-1 gap-0.5">
              <Text class="text-foreground">{option().label}</Text>
              <If when={option().description}>{(d) => <Text class="text-sm text-muted-foreground">{d()}</Text>}</If>
            </View>
          </Radio>
        )}
      </Each>
    </RadioGroup>
  );
}

/** A row that opens something: icon, label, an optional value, and a chevron. */
export function NavRow(props: { icon: IconName; label: string; value?: string; onPress: () => void }) {
  return (
    <Button
      onPress={props.onPress}
      class="min-h-11 flex-row items-center gap-3 rounded-(--radius) px-3 py-2 hover:bg-accent active:bg-accent"
    >
      <Icon name={props.icon} size={18} tone="muted-foreground" />
      <Text class="flex-1 text-foreground">{props.label}</Text>
      <If when={props.value}>{(v) => <Text class="text-sm text-muted-foreground">{v()}</Text>}</If>
      <Icon name="chevron-right" size={16} tone="muted-foreground" />
    </Button>
  );
}

import { Text, View } from "nsh";
import { Select } from "nsh/base";
import { Segmented, SettingsGroup, SettingsRow } from "../../components/settings";
import { IconButton, popupClass } from "../../components/ui";
import { apiSignal } from "../../api";

type Mode = "never" | "auto" | "ask";
type Effect = "always_allow" | "require_approval" | "deny";
type Rule = { tool: string; effect: Effect };

const mode = apiSignal<Mode>("approvals", "mode", "ask");
const checkerAvailable = apiSignal("approvals", "checkerAvailable", false);
const rules = apiSignal<Rule[]>("approvals", "rules", []);
const tools = apiSignal<string[]>("approvals", "tools", []);
const explicitApproval = apiSignal<Record<string, true>>("approvals", "explicitApproval", {});
const label = (tool: string) => {
  const text = tool.replace(/_/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const modes: { value: Mode; label: string }[] = [
  { value: "never", label: "Never ask" },
  { value: "auto", label: "Auto" },
  { value: "ask", label: "Ask" },
];
const effects: { value: Effect; label: string }[] = [
  { value: "always_allow", label: "Allow" },
  { value: "require_approval", label: "Ask" },
  { value: "deny", label: "Block" },
];
const groups: { effect: Effect; title: string }[] = [
  { effect: "always_allow", title: "Always allow" },
  { effect: "require_approval", title: "Always ask" },
  { effect: "deny", title: "Blocked" },
];

export function ApprovalsSettings() {
  const available = () =>
    tools()
      .filter((tool) => !rules().some((rule) => rule.tool === tool))
      .map((tool) => ({ value: tool, title: label(tool) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  return (
    <>
      <SettingsGroup>
        <SettingsRow first label="Mode" control={<Segmented options={modes} value={mode()} onChange={(value) => mode.set(value)} />}>
          <Text class="text-sm text-muted-foreground">
            {mode() === "never"
              ? "Asks only before purchases and the first use of your computer. Only Block rules apply."
              : mode() === "auto"
                ? checkerAvailable()
                  ? "A model approves routine actions and asks you about the rest."
                  : "Add a model in Settings to use this."
                : "Asks before sending, spending or changing anything in your apps."}
          </Text>
        </SettingsRow>
      </SettingsGroup>
      <Select
        items={available()}
        value={null}
        onChange={({ value }) => {
          if (value) rules.update((current) => [...current, { tool: value, effect: "require_approval" }]);
        }}
        accessibilityLabel="Add rule"
        searchable
        searchPlaceholder="Search"
        searchAccessibilityLabel="Search tools"
        popupClass={`${popupClass} max-h-80`}
        backdropClass="bg-overlay"
        itemClass="rounded-md px-2.5 py-1.5 text-sm text-popover-foreground focus:bg-accent selected:font-medium"
        searchClass="mb-1 min-h-9 rounded-md border border-input px-2.5 text-sm text-foreground"
        empty={<Text class="p-4 text-center text-sm text-muted-foreground">No matches</Text>}
        trigger={
          <View class="min-h-8 self-start items-center justify-center rounded-full border border-border bg-background px-4 py-1.5 hover:bg-accent">
            <Text class="text-sm font-medium text-foreground">Add rule</Text>
          </View>
        }
      />
      <Each of={groups} key={(group) => group.effect}>
        {(group) => (
          <If when={rules().some((rule) => rule.effect === group().effect)}>
            <View class={mode() === "never" && group().effect !== "deny" ? "opacity-50" : ""}>
              <SettingsGroup title={group().title}>
                <Each of={rules().filter((rule) => rule.effect === group().effect)} key={(rule) => rule.tool}>
                  {(rule, index) => (
                    <SettingsRow
                      first={index() === 0}
                      label={label(rule().tool)}
                      control={
                        <>
                          <Segmented
                            options={
                              explicitApproval()[rule().tool] ? effects.filter((effect) => effect.value !== "always_allow") : effects
                            }
                            value={rule().effect}
                            onChange={(effect) =>
                              rules.update((current) => current.map((item) => (item.tool === rule().tool ? { ...item, effect } : item)))
                            }
                          />
                          <IconButton
                            icon="trash"
                            label={`Remove ${label(rule().tool)}`}
                            onPress={() => rules.update((current) => current.filter((item) => item.tool !== rule().tool))}
                          />
                        </>
                      }
                    />
                  )}
                </Each>
              </SettingsGroup>
            </View>
          </If>
        )}
      </Each>
    </>
  );
}

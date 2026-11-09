import { signal, Text, View } from "nsh";
import { Select } from "nsh/base";
import { Segmented, SettingsGroup, SettingsRow } from "../../components/settings";
import { IconButton, popupClass } from "../../components/ui";

type Mode = "never" | "auto" | "ask";
type Effect = "always_allow" | "require_approval" | "deny";
type Rule = { tool: string; effect: Effect };

const mode = signal<Mode>("ask");
const checkerAvailable = true;
const rules = signal<Rule[]>([
  { tool: "read_file", effect: "always_allow" },
  { tool: "send_email", effect: "require_approval" },
  { tool: "delete_email", effect: "deny" },
]);
const tools = [
  "computer_observe",
  "computer_act",
  "browser_navigate",
  "browser_snapshot",
  "browser_act",
  "list_files",
  "read_file",
  "write_file",
  "attach_file",
  "shell",
  "user_computer_shell",
  "user_computer_observe",
  "user_computer_act",
  "open_path",
  "launch_app",
  "request_takeover",
  "ask_user",
  "connect_app",
  "message_user",
  "request_secret",
  "generate_secret",
  "list_secrets",
  "secret_request",
  "forget_secret",
  "render_plot",
  "save_page",
  "generate_image",
  "generate_video",
  "add_mcp_server",
  "remember",
  "save_shared_memory",
  "web_search",
  "web_fetch",
  "cloud_agent_launch",
  "cloud_agent_status",
  "cloud_agent_reply",
  "cloud_agent_cancel",
  "request_purchase",
  "purchase_status",
  "paid_request",
  "search_history",
  "read_history",
  "read_email",
  "delete_email",
  "claim_email_address",
  "send_email",
  "save_memory",
  "recall_memory",
  "forget_memory",
  "task_catalog",
  "scratchpad_list",
  "scratchpad_add",
  "scratchpad_update",
  "scratchpad_complete",
  "scratchpad_remove",
  "board_tickets",
  "ticket_get",
  "ticket_create",
  "ticket_update",
  "ticket_comment",
  "schedule_create",
  "schedule_list",
  "schedule_update",
  "schedule_cancel",
  "end_call",
  "call_user",
  "skill_read",
  "skill_create",
  "skill_update",
  "skill_delete",
  "run_subagent",
  "create_space",
  "spawn_bot",
  "update_bot",
  "list_fleet",
  "create_group",
  "update_group",
  "organize_bot",
  "set_child_instructions",
  "set_child_bot_model",
  "create_child_routine",
  "archive_bot",
  "message_bot",
  "handoff_to_bot",
  "update_preferences",
  "feedback",
  "connect_agent",
  "respond_agent_connection",
  "message_agent",
];
const explicitApproval: Record<string, true> = {
  claim_email_address: true,
  respond_agent_connection: true,
  create_space: true,
  set_child_instructions: true,
  set_child_bot_model: true,
};
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
    tools
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
                ? checkerAvailable
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
                            options={explicitApproval[rule().tool] ? effects.filter((effect) => effect.value !== "always_allow") : effects}
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

// What can be done to a chat, shared by its row's context menu and its header's menu.
import { AlertDialog } from "nsh/base";
import { MenuDivider, MenuRow, SubmenuRow } from "../components/ui";
import { nameSection, openBotDetails, selectedChatId } from "../nav";
import {
  allSections,
  chatById,
  clearHistory,
  deleteChat,
  isSnoozed,
  listedChats,
  setChatArchived,
  setChatPinned,
  setChatSection,
  setChatUnread,
  snoozeChat,
} from "../store";

/** After the selected chat leaves the list, the first one left takes its place. */
function reselect(id: string) {
  if (selectedChatId() === id) selectedChatId.set(listedChats()[0]?.id ?? "");
}

const HOUR = 60 * 60 * 1000;

/** When each snooze wakes, in the device's time zone: mornings at 9, next week on Monday. */
const snoozePresets = [
  { label: "1 hour", wake: (now: Date) => new Date(now.getTime() + HOUR) },
  { label: "3 hours", wake: (now: Date) => new Date(now.getTime() + 3 * HOUR) },
  { label: "Tomorrow", wake: (now: Date) => morning(now, 1) },
  { label: "Next week", wake: (now: Date) => morning(now, (8 - now.getDay()) % 7 || 7) },
];

function morning(now: Date, days: number) {
  const wake = new Date(now);
  wake.setHours(9, 0, 0, 0);
  wake.setDate(wake.getDate() + days);
  return wake;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A wake time: the clock today, with the weekday within a week, else with the date. */
export function wakeLabel(wake: Date, now = new Date()) {
  const clock = `${wake.getHours() % 12 || 12}:${String(wake.getMinutes()).padStart(2, "0")} ${wake.getHours() < 12 ? "AM" : "PM"}`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Calendar days, so a daylight-saving change doesn't move a wake across the cutoff.
  const days = Math.round((startOfDay(wake) - startOfDay(now)) / (24 * HOUR));
  if (days === 0) return clock;
  if (days < 7) return `${WEEKDAYS[wake.getDay()]} ${clock}`;
  return `${MONTHS[wake.getMonth()]} ${wake.getDate()}, ${clock}`;
}

async function confirmClear(id: string) {
  const { action } = await AlertDialog.show({
    title: `Clear "${chatById(id)?.title}"?`,
    description: "The messages go. The bot keeps its settings, routines and pages.",
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Clear history", role: "destructive", id: "clear" },
    ],
  });
  if (action === "clear") clearHistory(id);
}

export async function confirmDelete(id: string) {
  const { action } = await AlertDialog.show({
    title: `Delete "${chatById(id)?.title}"?`,
    description: "Its messages, routines and pages go too. This can't be undone.",
    actions: [
      { label: "Cancel", role: "cancel", id: "cancel" },
      { label: "Delete", role: "destructive", id: "delete" },
    ],
  });
  if (action === "delete") {
    deleteChat(id);
    reselect(id);
  }
}

/** The chat's menu items; `details` adds the bot details entry (the header's menu). */
export function ChatActions(props: { chatId: string; details?: boolean }) {
  const chat = () => chatById(props.chatId);
  return (
    <>
      <If when={props.details}>
        <MenuRow icon="panel-right" label="Bot details" onSelect={() => chat() && openBotDetails(chat()!.botIds[0])} />
        <MenuDivider />
      </If>
      <MenuRow
        icon={chat()?.pinned ? "pin-off" : "pin"}
        label={chat()?.pinned ? "Unpin" : "Pin"}
        onSelect={() => setChatPinned(props.chatId, !chat()?.pinned)}
      />
      <MenuRow
        icon="message-square-dot"
        label={chat()?.unread ? "Mark as read" : "Mark as unread"}
        onSelect={() => setChatUnread(props.chatId, !chat()?.unread)}
      />
      <SubmenuRow icon="folder-input" label="Move to">
        <Each of={allSections()} key={(s) => s.id}>
          {(section) => (
            <MenuRow
              icon={chat()?.sectionId === section().id ? "check" : "folder-input"}
              label={section().name}
              onSelect={() => setChatSection(props.chatId, section().id)}
            />
          )}
        </Each>
        <MenuRow
          icon={chat()?.sectionId ? "folder-input" : "check"}
          label="No section"
          onSelect={() => setChatSection(props.chatId, null)}
        />
        <MenuDivider />
        <MenuRow icon="plus" label="New section…" onSelect={() => nameSection({ id: null, chatId: props.chatId })} />
      </SubmenuRow>
      <If
        when={chat() && isSnoozed(chat()!)}
        else={
          <SubmenuRow icon="alarm-clock" label="Snooze">
            <Each of={snoozePresets} key={(p) => p.label}>
              {(preset) => (
                <MenuRow
                  icon="clock"
                  label={preset().label}
                  detail={wakeLabel(preset().wake(new Date()))}
                  onSelect={() => {
                    snoozeChat(props.chatId, preset().wake(new Date()).getTime());
                    reselect(props.chatId);
                  }}
                />
              )}
            </Each>
          </SubmenuRow>
        }
      >
        <MenuRow icon="alarm-clock" label="Unsnooze" onSelect={() => snoozeChat(props.chatId, null)} />
      </If>
      <MenuRow
        icon="archive"
        label="Archive"
        onSelect={() => {
          setChatArchived(props.chatId, true);
          reselect(props.chatId);
        }}
      />
      <MenuDivider />
      <MenuRow icon="eraser" label="Clear history…" onSelect={() => void confirmClear(props.chatId)} />
      <MenuRow icon="trash" label="Delete…" destructive onSelect={() => void confirmDelete(props.chatId)} />
    </>
  );
}

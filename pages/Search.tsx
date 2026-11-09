// Search: a command palette over chats, bots and actions, opened from the sidebar or with mod+k.
import { keymap, Text, View } from "nsh";
import { Command, Dialog } from "nsh/base";
import { newBotOpen, openBotDetails, openChat, openSettings, searchOpen } from "../nav";
import { allBots, allChats, allPages } from "../store";

keymap.bind("mod+k", () => searchOpen.set(!searchOpen()), { when: "always" });

const actions: Record<string, () => void> = {
  "action:new-bot": () => newBotOpen.set(true),
  "action:settings": () => openSettings(),
};

function choose(id: string) {
  searchOpen.set(false);
  const [kind, rest] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (kind === "chat") openChat(rest);
  else if (kind === "bot") openBotDetails(rest);
  else if (kind === "page") openBotDetails(rest.split("/")[0], "pages");
  else actions[id]?.();
}

export function SearchPalette() {
  const items = () => [
    ...allChats().map((c) => ({ id: `chat:${c.id}`, label: c.title, keywords: [c.preview], group: "Chats" })),
    ...allBots().map((b) => ({ id: `bot:${b.id}`, label: `${b.name} settings`, keywords: [b.instructions], group: "Bot settings" })),
    ...allPages().map((p) => ({ id: `page:${p.botId}/${p.id}`, label: p.title, group: "Pages" })),
    { id: "action:new-bot", label: "New bot", group: "Actions" },
    { id: "action:settings", label: "Settings", group: "Actions" },
  ];
  return (
    <Dialog
      open={searchOpen()}
      onOpenChange={({ open }) => searchOpen.set(open)}
      animation="fade"
      backdropClass="bg-overlay"
      class="mt-24 w-full max-w-xl self-center overflow-hidden rounded-(--radius) border border-border bg-popover shadow-lg"
    >
      <Command
        items={items()}
        autoFocus
        placeholder="Search chats, bots and pages"
        accessibilityLabel="Search"
        onSelect={({ id }) => choose(id)}
        onCancel={() => searchOpen.set(false)}
        searchClass="min-h-12 border-b border-border px-4 text-popover-foreground placeholder:text-muted-foreground"
        listClass="max-h-96 p-1"
        itemClass="rounded-md px-3 py-2 text-popover-foreground focus:bg-accent"
        groupClass="px-3 pt-2 pb-1 text-xs text-muted-foreground"
        empty={
          <View class="p-6">
            <Text class="text-center text-sm text-muted-foreground">Nothing matches</Text>
          </View>
        }
      />
    </Dialog>
  );
}

// Artifacts: the files bots made, as cards or a list, with a preview beside (wide) or in place of (phone) the list.
// Skipped until there is a backend: the bot, date and made-by-bots filters, Download and version history.
import { Scroll, signal, Text, View } from "nsh";
import { AlertDialog, Button, Input, TextView } from "nsh/base";
import { BotFace, fieldClass, Icon, IconButton, type IconName, TextButton } from "../components/ui";
import { mainView, nav, persisted, wide } from "../nav";
import { allArtifacts, type Artifact, botById, deleteArtifact } from "../store";

type ViewMode = "grid" | "list";
const viewMode = persisted<ViewMode>("pairidaeza.artifactsViewMode", "grid");
const query = signal<string | null>(null);
const selectedId = signal<string | null>(null);

const TYPE_LABELS: Record<string, string> = {
  "text/markdown": "MD",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "text/html": "HTML",
  "application/pdf": "PDF",
  "application/json": "JSON",
};

/** A short file-type badge: "MD", "CSV", or the subtype in capitals. */
const typeLabel = (mimeType: string) => TYPE_LABELS[mimeType] ?? (mimeType.split("/")[1] ?? mimeType).toUpperCase();

function typeIcon(mimeType: string): IconName {
  if (mimeType === "text/csv") return "file-spreadsheet";
  if (mimeType.startsWith("text/")) return "file-text";
  if (mimeType.startsWith("image/")) return "image";
  return "file";
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
function relativeTime(ms: number) {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" });
}

const matching = () => {
  const needle = query()?.trim().toLowerCase() ?? "";
  return allArtifacts().filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle));
};

async function confirmDelete(artifact: Artifact) {
  const { action } = await AlertDialog.show({
    title: `Delete "${artifact.name}"?`,
    description:
      artifact.versionCount > 1
        ? `This deletes all ${artifact.versionCount} versions of this artifact. This can't be undone.`
        : "This can't be undone.",
    actions: [
      { id: "cancel", label: "Cancel", role: "cancel" },
      { id: "delete", label: "Delete", role: "destructive" },
    ],
  });
  if (action !== "delete") return;
  if (selectedId() === artifact.id) selectedId.set(null);
  deleteArtifact(artifact.id);
}

function Badge(props: { children: string }) {
  return (
    <View class="rounded-md bg-muted px-2 py-1">
      <Text class="text-xs font-semibold text-muted-foreground">{props.children}</Text>
    </View>
  );
}

function Maker(props: { botId: string; size: number }) {
  return (
    <If when={botById(props.botId)}>
      {(bot) => (
        <>
          <BotFace bot={bot()} size={props.size} />
          <Text class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{bot().name}</Text>
        </>
      )}
    </If>
  );
}

function DeleteButton(props: { artifact: Artifact }) {
  return <IconButton icon="trash" label={`Delete ${props.artifact.name}`} onPress={() => void confirmDelete(props.artifact)} />;
}

function Card(props: { artifact: Artifact }) {
  return (
    <View class="w-64 grow">
      <Button
        onPress={() => selectedId.set(props.artifact.id)}
        accessibilityLabel={props.artifact.name}
        class="min-h-40 gap-4 rounded-2xl border border-border bg-card p-4 hover:bg-accent/40 active:bg-accent/40"
      >
        <View class="flex-row items-start justify-between">
          <View class="size-9 items-center justify-center rounded-md bg-accent">
            <Icon name={typeIcon(props.artifact.mimeType)} size={16} tone="accent-foreground" />
          </View>
          <View class="flex-row items-center gap-1.5">
            <If when={props.artifact.versionCount > 1}>
              <Badge>{`v${props.artifact.version}`}</Badge>
            </If>
            <Badge>{typeLabel(props.artifact.mimeType)}</Badge>
          </View>
        </View>
        <View class="min-w-0 gap-1">
          <Text class="truncate text-base font-semibold text-card-foreground">{props.artifact.name}</Text>
          <If when={props.artifact.description}>
            <Text class="line-clamp-2 text-sm text-muted-foreground">{props.artifact.description}</Text>
          </If>
        </View>
        <View class="mt-auto flex-row items-center gap-2 pr-9">
          <Maker botId={props.artifact.botId} size={20} />
          <Text class="text-xs text-muted-foreground">{relativeTime(props.artifact.createdAt)}</Text>
        </View>
      </Button>
      <View class="absolute bottom-2 right-2">
        <DeleteButton artifact={props.artifact} />
      </View>
    </View>
  );
}

function ListRow(props: { artifact: Artifact }) {
  return (
    <View class={`flex-row items-center pr-2 ${selectedId() === props.artifact.id ? "bg-accent/60" : ""}`}>
      <Button
        onPress={() => selectedId.set(props.artifact.id)}
        accessibilityLabel={props.artifact.name}
        class="min-w-0 flex-1 gap-1 px-4 py-3 hover:bg-accent/40 active:bg-accent/40"
      >
        <View class="flex-row items-center gap-2">
          <Icon name={typeIcon(props.artifact.mimeType)} size={14} tone="accent-foreground" />
          <Text class="min-w-0 flex-1 truncate font-medium text-foreground">{props.artifact.name}</Text>
          <If when={props.artifact.versionCount > 1}>
            <Badge>{`v${props.artifact.version}`}</Badge>
          </If>
        </View>
        <If when={props.artifact.description}>
          <Text class="pl-6 text-sm text-muted-foreground">{props.artifact.description}</Text>
        </If>
        <View class="flex-row items-center gap-1.5 pl-6">
          <Maker botId={props.artifact.botId} size={14} />
          <Text class="text-xs text-muted-foreground">{relativeTime(props.artifact.createdAt)}</Text>
        </View>
      </Button>
      <DeleteButton artifact={props.artifact} />
    </View>
  );
}

function Empty() {
  return (
    <View class="flex-1 items-center justify-center gap-2 p-6">
      <If
        when={allArtifacts().length === 0}
        else={
          <>
            <Text class="font-medium text-foreground">No matching artifacts</Text>
            <TextButton label="Clear filters" onPress={() => query.set(null)} />
          </>
        }
      >
        <Text class="font-medium text-foreground">No artifacts yet</Text>
        <Text class="text-center text-sm text-muted-foreground">Files your bots create, like reports, docs and images, collect here.</Text>
      </If>
    </View>
  );
}

function Browsing() {
  return (
    <Scroll keyboardShouldPersistTaps="handled" class="flex-1" contentClass="p-4">
      <If
        when={viewMode() === "grid"}
        else={
          <View class="overflow-hidden rounded-xl border border-border">
            <Each of={matching()} key={(a) => a.id}>
              {(a) => <ListRow artifact={a()} />}
            </Each>
          </View>
        }
      >
        <View class="flex-row flex-wrap gap-4">
          <Each of={matching()} key={(a) => a.id}>
            {(a) => <Card artifact={a()} />}
          </Each>
        </View>
      </If>
    </Scroll>
  );
}

function Body(props: { artifact: Artifact }) {
  const mime = () => props.artifact.mimeType;
  return (
    <Scroll class="flex-1" contentClass="p-5">
      <If when={mime() === "text/markdown"}>
        <TextView markdown={props.artifact.content} selectable class="text-foreground" />
      </If>
      <If when={mime() === "text/html"}>
        <TextView html={props.artifact.content} selectable class="text-foreground" />
      </If>
      <If when={mime() === "text/csv" || mime() === "text/plain"}>
        <View selectable>
          <Text class="font-mono text-sm text-foreground">{props.artifact.content}</Text>
        </View>
      </If>
      <If when={!mime().startsWith("text/")}>
        <Text class="text-center text-muted-foreground">Preview isn't available for this file type.</Text>
      </If>
    </Scroll>
  );
}

function Preview(props: { artifact: Artifact }) {
  return (
    <View class="min-w-0 flex-1">
      <View class="gap-0.5 border-b border-border px-5 py-3">
        <Text role="header" class="truncate text-base font-semibold text-foreground">
          {props.artifact.name}
        </Text>
        <If when={props.artifact.description}>
          <Text class="truncate text-sm text-muted-foreground">{props.artifact.description}</Text>
        </If>
        <If when={props.artifact.versionCount > 1}>
          <Text class="text-xs text-muted-foreground">{`v${props.artifact.version} of ${props.artifact.versionCount}`}</Text>
        </If>
      </View>
      <Body artifact={props.artifact} />
    </View>
  );
}

function Search() {
  return (
    <If when={query() !== null} else={<IconButton icon="search" label="Search artifacts" onPress={() => query.set("")} />}>
      <Input
        value={query() ?? ""}
        onChange={({ value }) => query.set(value)}
        autoFocus
        placeholder="Search artifacts…"
        accessibilityLabel="Search artifacts"
        class={`${fieldClass} w-56`}
      />
    </If>
  );
}

/** Back leaves a preview first, then the page: to the chat beside the sidebar, or one page back on a phone. */
function back() {
  if (selectedId() !== null && !wide()) return selectedId.set(null);
  selectedId.set(null);
  if (wide()) mainView.set("chat");
  else nav.pop();
}

export function ArtifactsPage() {
  const selected = () => allArtifacts().find((a) => a.id === selectedId());
  return (
    <View class="min-w-0 flex-1 bg-background">
      <View class="flex-row flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <View class="shrink-0 flex-1 flex-row items-center gap-1">
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <Text role="header" class="font-medium text-foreground">
            Artifacts
          </Text>
        </View>
        <If when={allArtifacts().length > 0}>
          <View class="flex-row items-center gap-2">
            <Search />
            <IconButton icon="layout-grid" label="Card view" selected={viewMode() === "grid"} onPress={() => viewMode.set("grid")} />
            <IconButton icon="list" label="List view" selected={viewMode() === "list"} onPress={() => viewMode.set("list")} />
          </View>
        </If>
      </View>
      <If when={matching().length > 0} else={<Empty />}>
        <View class="min-h-0 flex-1 flex-row">
          <If when={wide() || !selected()}>
            <View class={selected() ? "w-80 border-r border-border" : "flex-1"}>
              <If when={selected()} else={<Browsing />}>
                <Scroll class="flex-1">
                  <Each of={matching()} key={(a) => a.id}>
                    {(a) => <ListRow artifact={a()} />}
                  </Each>
                </Scroll>
              </If>
            </View>
          </If>
          <If when={selected()}>{(artifact) => <Preview artifact={artifact()} />}</If>
        </View>
      </If>
    </View>
  );
}

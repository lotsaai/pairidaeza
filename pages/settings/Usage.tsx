import { Text, View } from "nsh";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "nsh/base";
import { SettingsGroup } from "../../components/settings";

type UsageTotals = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  modelCalls?: number;
};

type UsageSummary = UsageTotals & {
  runs: number;
  models?: (Required<UsageTotals> & { provider: string; model: string })[];
};

const usage: UsageSummary = {
  runs: 128,
  inputTokens: 824000,
  outputTokens: 132000,
  totalTokens: 956000,
  costUsd: 4.27,
  modelCalls: 146,
  models: [
    {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      modelCalls: 92,
      inputTokens: 624000,
      outputTokens: 102000,
      totalTokens: 726000,
      costUsd: 3.65,
    },
    {
      provider: "openai-codex",
      model: "gpt-5.3-codex",
      modelCalls: 54,
      inputTokens: 200000,
      outputTokens: 30000,
      totalTokens: 230000,
      costUsd: 0.62,
    },
  ],
};

const number = (value: number | null | undefined) => (value == null ? "—" : value.toLocaleString("en-US"));
const cost = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value > 0 && value < 0.01
      ? "<$0.01"
      : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numericCell = "flex-1 items-end px-1 py-3";
const numericText = "text-right text-sm tabular-nums text-foreground";

/** Usage totals and per-model calls. */
export function UsageSettings() {
  return (
    <View class="gap-4">
      <View class="flex-row gap-3">
        <View class="flex-1 gap-1 rounded-xl border border-border px-4 py-3">
          <Text class="text-sm text-muted-foreground">Runs</Text>
          <Text class="text-lg font-medium tabular-nums text-foreground">{number(usage.runs)}</Text>
        </View>
        <View class="flex-1 gap-1 rounded-xl border border-border px-4 py-3">
          <Text class="text-sm text-muted-foreground">Tokens</Text>
          <Text class="text-lg font-medium tabular-nums text-foreground">{number(usage.totalTokens)}</Text>
        </View>
        <View class="flex-1 gap-1 rounded-xl border border-border px-4 py-3">
          <Text class="text-sm text-muted-foreground">Cost</Text>
          <Text class="text-lg font-medium tabular-nums text-foreground">{cost(usage.costUsd)}</Text>
        </View>
      </View>
      <If when={(usage.models?.length ?? 0) > 0}>
        <SettingsGroup>
          <Table accessibilityLabel="Usage" class="px-2">
            <TableHeader>
              <TableRow class="flex-row border-b border-border">
                <TableHead class="flex-[2] px-1 py-3">
                  <Text class="text-sm text-muted-foreground">Model</Text>
                </TableHead>
                <TableHead class={numericCell}>
                  <Text class="text-right text-sm text-muted-foreground">Calls</Text>
                </TableHead>
                <TableHead class={numericCell}>
                  <Text class="text-right text-sm text-muted-foreground">Input</Text>
                </TableHead>
                <TableHead class={numericCell}>
                  <Text class="text-right text-sm text-muted-foreground">Output</Text>
                </TableHead>
                <TableHead class={numericCell}>
                  <Text class="text-right text-sm text-muted-foreground">Cost</Text>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Each of={usage.models ?? []} key={(row) => `${row.provider}:${row.model}`}>
                {(row) => (
                  <TableRow class="flex-row border-b border-border">
                    <TableCell class="flex-[2] px-1 py-3">
                      <Text class="text-sm text-foreground">{row().model}</Text>
                      <Text class="text-xs text-muted-foreground">{row().provider}</Text>
                    </TableCell>
                    <TableCell class={numericCell}>
                      <Text class={numericText}>{number(row().modelCalls)}</Text>
                    </TableCell>
                    <TableCell class={numericCell}>
                      <Text class={numericText}>{number(row().inputTokens)}</Text>
                    </TableCell>
                    <TableCell class={numericCell}>
                      <Text class={numericText}>{number(row().outputTokens)}</Text>
                    </TableCell>
                    <TableCell class={numericCell}>
                      <Text class={numericText}>{cost(row().costUsd)}</Text>
                    </TableCell>
                  </TableRow>
                )}
              </Each>
            </TableBody>
          </Table>
        </SettingsGroup>
      </If>
    </View>
  );
}

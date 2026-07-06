import type { SyncedHistoryGroup } from "./externalSessionGrouping";

type SyncedHistorySource = "claude" | "codex";

function normalizeSource(value?: string | null): SyncedHistorySource | null {
  const source = value?.trim().toLowerCase();
  return source === "claude" || source === "codex" ? source : null;
}

function isBareCliCommand(command: string, source: SyncedHistorySource): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized === source
    || normalized === `${source}.cmd`
    || normalized === `${source}.exe`
    || normalized === `${source}.ps1`;
}

function latestResumeCommand(group: SyncedHistoryGroup, source: SyncedHistorySource): string | undefined {
  return [...group.sessions]
    .filter((session) => session.source === source && session.startupCmd.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    ?.startupCmd.trim();
}

export async function appendSyncedHistoryContextArg(
  source: string | undefined,
  startupCmd: string | undefined,
  group: SyncedHistoryGroup | null | undefined,
  _shell?: string | null
): Promise<string | undefined> {
  const normalizedSource = normalizeSource(source);
  if (!normalizedSource || !group) return startupCmd;

  const resumeCommand = latestResumeCommand(group, normalizedSource);
  if (!resumeCommand) return startupCmd;

  const command = startupCmd?.trim();
  if (!command || isBareCliCommand(command, normalizedSource)) return resumeCommand;
  return startupCmd;
}

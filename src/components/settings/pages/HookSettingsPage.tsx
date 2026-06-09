import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Badge, Box, Button, Card, Group, SimpleGrid, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useSettingsStore } from "@/stores/settingsStore";

type HookInstallStatus = "directoryMissing" | "notInstalled" | "partialInstalled" | "installed";

interface ToolHookSettingsStatus {
  configDir: string | null;
  hooksDir: string | null;
  configPath: string | null;
  featureConfigPath: string | null;
  status: HookInstallStatus;
  attentionScriptInstalled: boolean;
  finishedScriptInstalled: boolean;
  runningHookInstalled: boolean;
  attentionHookInstalled: boolean;
  stopHookInstalled: boolean;
  failureHookInstalled: boolean;
  hooksFeatureInstalled: boolean;
}

interface HookSettingsStatus {
  claude: ToolHookSettingsStatus;
  codex: ToolHookSettingsStatus;
}

const STATUS_LABELS: Record<HookInstallStatus, string> = {
  directoryMissing: "目录未选择",
  notInstalled: "未安装",
  partialInstalled: "部分安装",
  installed: "已安装",
};

const STATUS_COLORS: Record<HookInstallStatus, string> = {
  directoryMissing: "yellow",
  notInstalled: "gray",
  partialInstalled: "yellow",
  installed: "green",
};

function formatPath(value: string | null): string {
  return value && value.trim() ? value : "未选择";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PathRow({ label, value }: { label: string; value: string | null }) {
  const formatted = formatPath(value);
  const hasValue = Boolean(value && value.trim());

  return (
    <Group gap="md" wrap="nowrap" className="min-w-0 rounded-md bg-surface-container-lowest/70 px-3 py-2">
      <Text size="xs" c="var(--text-muted)" w={96} className="shrink-0">
        {label}
      </Text>
      <Text
        component="code"
        size="xs"
        ff="var(--font-ui-mono)"
        c={hasValue ? "var(--on-surface)" : "var(--text-muted)"}
        className="min-w-0 flex-1 break-all leading-5"
        title={formatted}
      >
        {formatted}
      </Text>
    </Group>
  );
}

function CheckRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <Group gap="xs" wrap="nowrap" className="min-w-0 rounded-md bg-surface-container-lowest/70 px-2.5 py-1.5">
      <Box
        component="span"
        w={6}
        h={6}
        className="shrink-0"
        style={{ borderRadius: 999, backgroundColor: checked ? "var(--success)" : "var(--text-muted)" }}
      />
      <Text size="xs" c="var(--on-surface-variant)" truncate className="min-w-0 flex-1" title={label}>
        {label}
      </Text>
      <Text size="xs" fw={600} c={checked ? "var(--success)" : "var(--text-muted)"} className="shrink-0">
        {checked ? "已安装" : "未完整"}
      </Text>
    </Group>
  );
}

function StatusPill({ status }: { status: HookInstallStatus }) {
  return (
    <Badge variant="light" color={STATUS_COLORS[status]} radius="xl">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function SettingsSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
      <Group justify="space-between" align="center" gap="md" wrap="nowrap">
        <Box>
          <Text size="sm" fw={500} c="var(--on-surface)">
            {title}
          </Text>
          <Text mt={4} size="xs" c="var(--text-muted)">
            {description}
          </Text>
        </Box>
        <Switch
          color="cliPrimary"
          className="shrink-0"
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          aria-label={title}
        />
      </Group>
    </Card>
  );
}

export function HookSettingsPage() {
  const claudeHookConfigDir = useSettingsStore((s) => s.claudeHookConfigDir);
  const codexHookConfigDir = useSettingsStore((s) => s.codexHookConfigDir);
  const [status, setStatus] = useState<HookSettingsStatus | null>(null);
  const [selectedDir, setSelectedDir] = useState<string | null>(claudeHookConfigDir);
  const [codexSelectedDir, setCodexSelectedDir] = useState<string | null>(codexHookConfigDir);
  const [loading, setLoading] = useState(false);
  const [claudeWorking, setClaudeWorking] = useState(false);
  const [codexWorking, setCodexWorking] = useState(false);
  const hookPopupNotificationsEnabled = useSettingsStore((s) => s.hookPopupNotificationsEnabled);
  const hookPopupAutoCloseEnabled = useSettingsStore((s) => s.hookPopupAutoCloseEnabled);
  const hookPopupAutoCloseSeconds = useSettingsStore((s) => s.hookPopupAutoCloseSeconds);
  const updateSetting = useSettingsStore((s) => s.update);
  const [autoCloseSecondsDraft, setAutoCloseSecondsDraft] = useState(String(hookPopupAutoCloseSeconds));

  useEffect(() => {
    setAutoCloseSecondsDraft(String(hookPopupAutoCloseSeconds));
  }, [hookPopupAutoCloseSeconds]);

  const selectedDirArg = useMemo(() => selectedDir ?? undefined, [selectedDir]);
  const codexSelectedDirArg = useMemo(() => codexSelectedDir ?? undefined, [codexSelectedDir]);

  const refreshStatus = async (dir = selectedDirArg, codexDir = codexSelectedDirArg) => {
    setLoading(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_get_status", {
        selectedDir: dir,
        codexSelectedDir: codexDir,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) {
        setSelectedDir(nextStatus.claude.configDir);
      }
      if (nextStatus.codex.configDir) {
        setCodexSelectedDir(nextStatus.codex.configDir);
      }
    } catch (error) {
      toast.error("刷新 Hook 状态失败", { description: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const handleSelectDir = async () => {
    try {
      const dir = await invoke<string | null>("hook_settings_select_dir", {
        title: "选择 Claude 配置目录",
      });
      if (!dir) return;
      setSelectedDir(dir);
      await updateSetting("claudeHookConfigDir", dir);
      await refreshStatus(dir, codexSelectedDirArg);
    } catch (error) {
      toast.error("选择目录失败", { description: getErrorMessage(error) });
    }
  };

  const handleSelectCodexDir = async () => {
    try {
      const dir = await invoke<string | null>("hook_settings_select_dir", {
        title: "选择 Codex 配置目录",
      });
      if (!dir) return;
      setCodexSelectedDir(dir);
      await updateSetting("codexHookConfigDir", dir);
      await refreshStatus(selectedDirArg, dir);
    } catch (error) {
      toast.error("选择 Codex 目录失败", { description: getErrorMessage(error) });
    }
  };

  const handleClaudeInstall = async () => {
    setClaudeWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_install", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) setSelectedDir(nextStatus.claude.configDir);
      toast.success("Claude Hook 已安装");
    } catch (error) {
      toast.error("安装 Claude Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setClaudeWorking(false);
    }
  };

  const handleClaudeUninstall = async () => {
    setClaudeWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_uninstall", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.claude.configDir) setSelectedDir(nextStatus.claude.configDir);
      toast.success("Claude Hook 已删除");
    } catch (error) {
      toast.error("删除 Claude Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setClaudeWorking(false);
    }
  };

  const handleCodexInstall = async () => {
    setCodexWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_install_codex", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.codex.configDir) setCodexSelectedDir(nextStatus.codex.configDir);
      toast.success("Codex Hook 已安装");
    } catch (error) {
      toast.error("安装 Codex Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setCodexWorking(false);
    }
  };

  const handleCodexUninstall = async () => {
    setCodexWorking(true);
    try {
      const nextStatus = await invoke<HookSettingsStatus>("hook_settings_uninstall_codex", {
        selectedDir: selectedDirArg,
        codexSelectedDir: codexSelectedDirArg,
      });
      setStatus(nextStatus);
      if (nextStatus.codex.configDir) setCodexSelectedDir(nextStatus.codex.configDir);
      toast.success("Codex Hook 已删除");
    } catch (error) {
      toast.error("删除 Codex Hook 失败", { description: getErrorMessage(error) });
    } finally {
      setCodexWorking(false);
    }
  };

  const handleCommitAutoCloseSeconds = () => {
    const nextValue = Number(autoCloseSecondsDraft);
    const nextSeconds = Number.isFinite(nextValue) ? Math.round(nextValue) : hookPopupAutoCloseSeconds;
    const clampedSeconds = Math.max(5, Math.min(3600, nextSeconds));
    setAutoCloseSecondsDraft(String(clampedSeconds));
    if (clampedSeconds !== hookPopupAutoCloseSeconds) {
      void updateSetting("hookPopupAutoCloseSeconds", clampedSeconds);
    }
  };

  const claude = status?.claude;
  const codex = status?.codex;
  const claudeStatus = claude?.status ?? "directoryMissing";
  const codexStatus = codex?.status ?? "directoryMissing";
  const claudeRunningInstalled = Boolean(claude?.attentionScriptInstalled && claude.runningHookInstalled);
  const claudeAttentionInstalled = Boolean(claude?.attentionScriptInstalled && claude.attentionHookInstalled);
  const claudeFinishedInstalled = Boolean(claude?.finishedScriptInstalled && claude.stopHookInstalled && claude.failureHookInstalled);
  const codexRunningInstalled = Boolean(codex?.attentionScriptInstalled && codex.runningHookInstalled);
  const codexAttentionInstalled = Boolean(codex?.attentionScriptInstalled && codex.attentionHookInstalled);
  const codexFinishedInstalled = Boolean(codex?.finishedScriptInstalled && codex.stopHookInstalled);

  return (
    <Stack gap="md">
      <Card className="ui-surface-card" p="md">
        <Stack gap="md">
          <Box>
            <Text size="sm" fw={600} c="var(--on-surface)">
              Hook 通知弹框
            </Text>
            <Text mt={4} size="xs" c="var(--on-surface-variant)">
              控制 Claude Code 和 Codex CLI Hook 事件的右上角弹框；终端标签小圆点不受这里的弹框开关影响。
            </Text>
          </Box>
          <SettingsSwitchRow
            title="通知弹框"
            description="关闭后不再弹出 Hook 通知卡片，只更新标签栏小圆点颜色。"
            checked={hookPopupNotificationsEnabled}
            onCheckedChange={(checked) => void updateSetting("hookPopupNotificationsEnabled", checked)}
          />
          <SettingsSwitchRow
            title="自动关闭弹框"
            description="开启后 Hook 通知会在指定时间后自动消失。"
            checked={hookPopupAutoCloseEnabled}
            onCheckedChange={(checked) => void updateSetting("hookPopupAutoCloseEnabled", checked)}
          />
          <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
            <Group justify="space-between" align="center" gap="md">
              <Box>
                <Text size="sm" fw={500} c="var(--on-surface)">
                  默认关闭时间
                </Text>
                <Text mt={4} size="xs" c="var(--text-muted)">
                  单位：秒，默认 60 秒；仅在自动关闭开启时可编辑。
                </Text>
              </Box>
              <Group gap="xs">
              <TextInput
                type="number"
                min={5}
                max={3600}
                step={1}
                value={autoCloseSecondsDraft}
                disabled={!hookPopupAutoCloseEnabled}
                onChange={(e) => setAutoCloseSecondsDraft(e.target.value)}
                onBlur={handleCommitAutoCloseSeconds}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCommitAutoCloseSeconds();
                  }
                }}
                w={96}
                size="xs"
                aria-label="Hook 弹框默认关闭时间"
              />
                <Text size="xs" c="var(--on-surface-variant)">
                  秒
                </Text>
              </Group>
            </Group>
          </Card>
        </Stack>
      </Card>

      <Card className="ui-surface-card" p="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Box>
              <Text size="sm" fw={600} c="var(--on-surface)">
                Claude Code Hook 桥接
              </Text>
              <Text mt={4} size="xs" c="var(--on-surface-variant)">
                Claude Code 的运行中、待审批、完成和异常退出状态通过 Hook 脚本上报；普通 shell 命令由通用 Shell 运行监控补充。
              </Text>
            </Box>
            <StatusPill status={claudeStatus} />
          </Group>
          <Card className="bg-surface-container-low" p="xs" radius="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={6}>
              <PathRow label="Claude 配置目录" value={claude?.configDir ?? selectedDir} />
              <PathRow label="hooks 目录" value={claude?.hooksDir ?? null} />
              <PathRow label="settings.json" value={claude?.configPath ?? null} />
            </SimpleGrid>
          </Card>

          <Card className="bg-surface-container-low" p="xs" radius="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={6}>
              <CheckRow label="运行中 Hook（UserPromptSubmit）" checked={claudeRunningInstalled} />
              <CheckRow label="待审批 Hook（Notification）" checked={claudeAttentionInstalled} />
              <CheckRow label="完成/异常 Hook（Stop / StopFailure）" checked={claudeFinishedInstalled} />
            </SimpleGrid>
          </Card>

          <Card className="bg-surface-container-low" p="sm" radius="lg">
            <Text size="xs" lh={1.6} c="var(--on-surface-variant)">
            安装只会写入 <span className="font-mono">notify-cli-manager-approval.ps1</span> 和{" "}
            <span className="font-mono">notify-cli-manager-finished.ps1</span>，并合并修改 Claude 的{" "}
            <span className="font-mono">settings.json</span>。删除时不会移除用户自己的 hooks，也不会删除旧的{" "}
            <span className="font-mono">notify.ps1</span> 或 <span className="font-mono">notify-cli-manager.ps1</span>。
            </Text>
          </Card>

          <Group gap="xs">
            <Button variant="light" color="cliPrimary" size="xs" onClick={handleSelectDir} disabled={loading || claudeWorking || codexWorking}>
              选择 Claude 目录
            </Button>
            <Button color="cliPrimary" size="xs" onClick={handleClaudeInstall} disabled={loading || claudeWorking || claudeStatus === "directoryMissing"}>
              {claudeWorking ? "处理中..." : "安装 Claude Hook"}
            </Button>
            <Button variant="light" color="red" size="xs" onClick={handleClaudeUninstall} disabled={loading || claudeWorking || claudeStatus === "directoryMissing"}>
              删除 Claude Hook
            </Button>
            <Button variant="default" color="gray" size="xs" onClick={() => void refreshStatus()} disabled={loading || claudeWorking || codexWorking}>
              {loading ? "刷新中..." : "刷新状态"}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card className="ui-surface-card" p="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Box>
              <Text size="sm" fw={600} c="var(--on-surface)">
                Codex CLI Hook 桥接
              </Text>
              <Text mt={4} size="xs" c="var(--on-surface-variant)">
                Codex 的运行中、待审批和完成状态通过 Hook 脚本上报；普通 shell 命令由通用 Shell 运行监控补充。
              </Text>
            </Box>
            <StatusPill status={codexStatus} />
          </Group>
          <Card className="bg-surface-container-low" p="xs" radius="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={6}>
              <PathRow label="Codex 配置目录" value={codex?.configDir ?? codexSelectedDir} />
              <PathRow label="hooks 目录" value={codex?.hooksDir ?? null} />
              <PathRow label="hooks.json" value={codex?.configPath ?? null} />
              <PathRow label="config.toml" value={codex?.featureConfigPath ?? null} />
            </SimpleGrid>
          </Card>

          <Card className="bg-surface-container-low" p="xs" radius="lg">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={6}>
              <CheckRow label="运行中 Hook（UserPromptSubmit）" checked={codexRunningInstalled} />
              <CheckRow label="待审批 Hook（PermissionRequest）" checked={codexAttentionInstalled} />
              <CheckRow label="完成 Hook（Stop）" checked={codexFinishedInstalled} />
              <CheckRow label="Hooks 功能（[features].hooks）" checked={Boolean(codex?.hooksFeatureInstalled)} />
            </SimpleGrid>
          </Card>

          <Card className="bg-surface-container-low" p="sm" radius="lg">
            <Text size="xs" lh={1.6} c="var(--on-surface-variant)">
            安装会写入用户级 <span className="font-mono">~/.codex/hooks.json</span> 和{" "}
            <span className="font-mono">~/.codex/hooks/</span> 下的 CLI-Manager 脚本，不修改项目{" "}
            <span className="font-mono">.codex/hooks.json</span>。安装会自动写入{" "}
            <span className="font-mono">~/.codex/config.toml</span> 并开启{" "}
            <span className="font-mono">[features].hooks = true</span>，Codex 0.129+ 仍需要在 TUI 里执行{" "}
            <span className="font-mono">/hooks</span> 批准脚本。
            </Text>
          </Card>

          <Group gap="xs">
            <Button variant="light" color="cliPrimary" size="xs" onClick={handleSelectCodexDir} disabled={loading || claudeWorking || codexWorking}>
              选择 Codex 目录
            </Button>
            <Button color="cliPrimary" size="xs" onClick={handleCodexInstall} disabled={loading || codexWorking}>
              {codexWorking ? "处理中..." : "安装 Codex Hook"}
            </Button>
            <Button variant="light" color="red" size="xs" onClick={handleCodexUninstall} disabled={loading || codexWorking || codexStatus === "directoryMissing"}>
              删除 Codex Hook
            </Button>
            <Button variant="default" color="gray" size="xs" onClick={() => void refreshStatus()} disabled={loading || claudeWorking || codexWorking}>
              {loading ? "刷新中..." : "刷新状态"}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}

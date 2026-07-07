import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ActionIcon, Badge, Box, Button, Card, Group, PasswordInput, Progress, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from "@mantine/core";
import { Gauge, RotateCcw, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_TERMINAL_INPUT_SUGGESTION_USAGE,
  TERMINAL_INPUT_SUGGESTION_BUILTIN_PROMPT,
  type TerminalInputSuggestionModelStatus,
  type TerminalInputSuggestionModelTestResult,
} from "@/lib/terminalInputSuggestions";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatMetricNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString();
}

function commandSuggestionStatusColor(status: TerminalInputSuggestionModelStatus | "fallback" | null | undefined): string {
  if (status === "operational") return "green";
  if (status === "degraded" || status === "fallback") return "yellow";
  if (status === "failed") return "red";
  return "gray";
}

export function CommandSuggestionSettingsPage() {
  const { t } = useI18n();
  const terminalInputSuggestionsEnabled = useSettingsStore((s) => s.terminalInputSuggestionsEnabled);
  const terminalInputSuggestionLlmEnabled = useSettingsStore((s) => s.terminalInputSuggestionLlmEnabled);
  const terminalInputSuggestionBaseUrl = useSettingsStore((s) => s.terminalInputSuggestionBaseUrl);
  const terminalInputSuggestionApiKey = useSettingsStore((s) => s.terminalInputSuggestionApiKey);
  const terminalInputSuggestionModel = useSettingsStore((s) => s.terminalInputSuggestionModel);
  const terminalInputSuggestionUseBuiltinPrompt = useSettingsStore((s) => s.terminalInputSuggestionUseBuiltinPrompt);
  const terminalInputSuggestionCustomPrompt = useSettingsStore((s) => s.terminalInputSuggestionCustomPrompt);
  const terminalInputSuggestionUsage = useSettingsStore((s) => s.terminalInputSuggestionUsage);
  const terminalInputSuggestionLastTest = useSettingsStore((s) => s.terminalInputSuggestionLastTest);
  const updateSetting = useSettingsStore((s) => s.update);
  const [testing, setTesting] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(terminalInputSuggestionBaseUrl);
  const [apiKeyDraft, setApiKeyDraft] = useState(terminalInputSuggestionApiKey);
  const [modelDraft, setModelDraft] = useState(terminalInputSuggestionModel);
  const [promptDraft, setPromptDraft] = useState(terminalInputSuggestionCustomPrompt);

  useEffect(() => setBaseUrlDraft(terminalInputSuggestionBaseUrl), [terminalInputSuggestionBaseUrl]);
  useEffect(() => setApiKeyDraft(terminalInputSuggestionApiKey), [terminalInputSuggestionApiKey]);
  useEffect(() => setModelDraft(terminalInputSuggestionModel), [terminalInputSuggestionModel]);
  useEffect(() => setPromptDraft(terminalInputSuggestionCustomPrompt), [terminalInputSuggestionCustomPrompt]);

  const commitConfig = async () => {
    await Promise.all([
      updateSetting("terminalInputSuggestionBaseUrl", baseUrlDraft.trim()),
      updateSetting("terminalInputSuggestionApiKey", apiKeyDraft.trim()),
      updateSetting("terminalInputSuggestionModel", modelDraft.trim()),
      updateSetting("terminalInputSuggestionCustomPrompt", promptDraft.trim()),
    ]);
  };

  const clearLastModelTest = async () => {
    if (terminalInputSuggestionLastTest) {
      await updateSetting("terminalInputSuggestionLastTest", null);
    }
  };

  const commitBaseUrl = async () => {
    const next = baseUrlDraft.trim();
    if (next === terminalInputSuggestionBaseUrl) return;
    await updateSetting("terminalInputSuggestionBaseUrl", next);
    await clearLastModelTest();
  };

  const commitApiKey = async () => {
    const next = apiKeyDraft.trim();
    if (next === terminalInputSuggestionApiKey) return;
    await updateSetting("terminalInputSuggestionApiKey", next);
    await clearLastModelTest();
  };

  const commitModel = async () => {
    const next = modelDraft.trim();
    if (next === terminalInputSuggestionModel) return;
    await updateSetting("terminalInputSuggestionModel", next);
    await clearLastModelTest();
  };

  const handleLlmToggle = async (enabled: boolean) => {
    await updateSetting("terminalInputSuggestionLlmEnabled", enabled);
    await updateSetting("terminalInputSuggestionProvider", enabled ? "ai" : "local");
  };

  const handleModelTest = async () => {
    const baseUrl = baseUrlDraft.trim();
    const apiKey = apiKeyDraft.trim();
    const model = modelDraft.trim();
    if (!baseUrl || !apiKey || !model) {
      toast.error(t("settings.commandSuggestions.modelConfigIncomplete"));
      return;
    }
    setTesting(true);
    try {
      await commitConfig();
      const result = await invoke<TerminalInputSuggestionModelTestResult>("command_suggestion_test_model", {
        baseUrl,
        apiKey,
        model,
      });
      await updateSetting("terminalInputSuggestionLastTest", result);
      const responseTime = result.responseTimeMs ?? 0;
      if (result.status === "operational") {
        toast.success(t("settings.commandSuggestions.modelAvailable"), {
          description: t("settings.commandSuggestions.responseTimeMs", { ms: responseTime }),
        });
      } else if (result.status === "degraded") {
        toast.warning(t("settings.commandSuggestions.modelSlow"), {
          description: t("settings.commandSuggestions.responseTimeMs", { ms: responseTime }),
        });
      } else {
        toast.error(t("settings.commandSuggestions.modelUnavailable"), {
          description: result.message,
        });
      }
    } catch (error) {
      toast.error(t("settings.commandSuggestions.modelTestFailed"), {
        description: getErrorMessage(error),
      });
    } finally {
      setTesting(false);
    }
  };

  const resetUsage = () => {
    void updateSetting("terminalInputSuggestionUsage", { ...DEFAULT_TERMINAL_INPUT_SUGGESTION_USAGE });
  };

  const successRate =
    terminalInputSuggestionUsage.requestCount > 0
      ? (terminalInputSuggestionUsage.successCount / terminalInputSuggestionUsage.requestCount) * 100
      : 0;
  const averageMs =
    terminalInputSuggestionUsage.requestCount > 0
      ? Math.round(terminalInputSuggestionUsage.totalResponseTimeMs / terminalInputSuggestionUsage.requestCount)
      : 0;
  const prompt = terminalInputSuggestionUseBuiltinPrompt
    ? TERMINAL_INPUT_SUGGESTION_BUILTIN_PROMPT
    : promptDraft;
  const lastStatus = terminalInputSuggestionLastTest?.status ?? terminalInputSuggestionUsage.lastStatus;
  const statusLabel =
    lastStatus === "operational"
      ? t("settings.commandSuggestions.statusAvailable")
      : lastStatus === "degraded"
        ? t("settings.commandSuggestions.statusSlow")
        : lastStatus === "failed"
          ? t("settings.commandSuggestions.statusUnavailable")
          : lastStatus === "fallback"
            ? t("settings.commandSuggestions.statusFallback")
            : t("settings.commandSuggestions.statusNotTested");

  return (
    <Stack gap="md">
      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Group gap="sm" wrap="nowrap">
              <Box style={{ color: "var(--primary)", marginTop: 2 }}>
                <Sparkles size={18} />
              </Box>
              <Box>
                <Text size="sm" fw={600} c="var(--on-surface)">
                  {t("settings.commandSuggestions.title")}
                </Text>
                <Text mt={4} size="xs" c="var(--on-surface-variant)">
                  {t("settings.commandSuggestions.description")}
                </Text>
              </Box>
            </Group>
            <Badge color={commandSuggestionStatusColor(lastStatus)} variant="light">
              {statusLabel}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {t("settings.commandSuggestions.enableSuggestions")}
                  </Text>
                  <Text mt={4} size="xs" c="var(--text-muted)">
                    {t("settings.commandSuggestions.enableSuggestionsDesc")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionsEnabled}
                  onChange={(event) => void updateSetting("terminalInputSuggestionsEnabled", event.currentTarget.checked)}
                  aria-label={t("settings.commandSuggestions.enableSuggestions")}
                />
              </Group>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {t("settings.commandSuggestions.enableLlm")}
                  </Text>
                  <Text mt={4} size="xs" c="var(--text-muted)">
                    {t("settings.commandSuggestions.enableLlmDesc")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionLlmEnabled}
                  disabled={!terminalInputSuggestionsEnabled}
                  onChange={(event) => void handleLlmToggle(event.currentTarget.checked)}
                  aria-label={t("settings.commandSuggestions.enableLlm")}
                />
              </Group>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <TextInput
              size="xs"
              label={t("settings.commandSuggestions.baseUrl")}
              placeholder="http://host:port/v1"
              value={baseUrlDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setBaseUrlDraft(event.currentTarget.value)}
              onBlur={() => void commitBaseUrl()}
            />
            <PasswordInput
              size="xs"
              label={t("settings.commandSuggestions.apiKey")}
              placeholder="sk-..."
              value={apiKeyDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setApiKeyDraft(event.currentTarget.value)}
              onBlur={() => void commitApiKey()}
            />
            <TextInput
              size="xs"
              label={t("settings.commandSuggestions.model")}
              placeholder="gpt-5.3-codex-spark"
              value={modelDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setModelDraft(event.currentTarget.value)}
              onBlur={() => void commitModel()}
            />
          </SimpleGrid>
          <Stack gap={2}>
            <Text size="10px" c="var(--text-muted)">
              {t("settings.commandSuggestions.baseUrlAutoDetectHelp")}
            </Text>
            <Text size="10px" c="var(--text-muted)">
              {t("settings.commandSuggestions.apiKeyStorageHint")}
            </Text>
          </Stack>

          <Group justify="space-between" align="center" gap="md">
            <Group gap="sm" wrap="nowrap">
              <Gauge size={16} style={{ color: "var(--primary)" }} />
              <Box>
                <Text size="xs" fw={600} c="var(--on-surface)">
                  {t("settings.commandSuggestions.modelTest")}
                </Text>
                <Text size="xs" c="var(--text-muted)">
                  {terminalInputSuggestionLastTest
                    ? `${statusLabel} · ${t("settings.commandSuggestions.responseTimeMs", { ms: terminalInputSuggestionLastTest.responseTimeMs ?? 0 })}`
                    : t("settings.commandSuggestions.modelTestNotTested")}
                </Text>
              </Box>
            </Group>
            <Button
              size="xs"
              color="cliPrimary"
              variant="light"
              loading={testing}
              disabled={!terminalInputSuggestionsEnabled}
              onClick={() => void handleModelTest()}
            >
              {testing ? t("settings.commandSuggestions.testing") : t("settings.commandSuggestions.testModel")}
            </Button>
          </Group>

          <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
            <Stack gap="sm">
              <Group justify="space-between" align="center" gap="md">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {t("settings.commandSuggestions.prompt")}
                  </Text>
                  <Text size="xs" c="var(--text-muted)">
                    {t("settings.commandSuggestions.promptDesc")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionUseBuiltinPrompt}
                  onChange={(event) => void updateSetting("terminalInputSuggestionUseBuiltinPrompt", event.currentTarget.checked)}
                  aria-label={t("settings.commandSuggestions.useBuiltinPrompt")}
                />
              </Group>
              <Textarea
                size="xs"
                minRows={3}
                autosize
                value={prompt}
                readOnly={terminalInputSuggestionUseBuiltinPrompt}
                disabled={!terminalInputSuggestionsEnabled}
                onChange={(event) => setPromptDraft(event.currentTarget.value)}
                onBlur={() => void updateSetting("terminalInputSuggestionCustomPrompt", promptDraft.trim())}
                aria-label={t("settings.commandSuggestions.promptAria")}
              />
            </Stack>
          </Card>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{t("settings.commandSuggestions.metricRequests")}</Text>
              <Text size="lg" fw={700} c="var(--on-surface)">{formatMetricNumber(terminalInputSuggestionUsage.requestCount)}</Text>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{t("settings.commandSuggestions.metricSuccessRate")}</Text>
              <Text size="lg" fw={700} c="var(--success)">{formatPercent(successRate)}</Text>
              <Progress mt={6} size="xs" color="green" value={successRate} />
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{t("settings.commandSuggestions.metricAvgLatency")}</Text>
              <Text size="lg" fw={700} c="var(--on-surface)">{t("settings.commandSuggestions.responseTimeMs", { ms: averageMs })}</Text>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" gap="xs" align="flex-start">
                <Box>
                  <Text size="xs" c="var(--text-muted)">{t("settings.commandSuggestions.metricTokens")}</Text>
                  <Text size="lg" fw={700} c="var(--on-surface)">{formatMetricNumber(terminalInputSuggestionUsage.totalTokens)}</Text>
                </Box>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={resetUsage}
                  aria-label={t("settings.commandSuggestions.resetStatsAria")}
                  title={t("settings.commandSuggestions.resetStats")}
                >
                  <RotateCcw size={14} />
                </ActionIcon>
              </Group>
              <Text mt={4} size="10px" c="var(--text-muted)">
                {t("settings.commandSuggestions.fallback")} {formatMetricNumber(terminalInputSuggestionUsage.fallbackCount)} · {t("settings.commandSuggestions.accepted")} {formatMetricNumber(terminalInputSuggestionUsage.acceptedCount)}
              </Text>
            </Card>
          </SimpleGrid>
        </Stack>
      </section>
    </Stack>
  );
}

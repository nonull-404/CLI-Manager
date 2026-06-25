import { Coins, Cpu, Database, Layers3, MessageSquare, TrendingUp } from "lucide-react";
import type { HistorySessionDetail } from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import {
  calculateTokenStats,
  Donut,
  formatCompactCount,
  formatCost,
  ProgressBar,
  SegmentedBar,
  Sparkline,
  TERM,
  type SparkPoint,
} from "../stats/termStatsUi";
import { getContextLimit } from "../../lib/modelPricing";

interface SessionContextViewProps {
  session: HistorySessionDetail | null;
}

export function SessionContextView({ session }: SessionContextViewProps) {
  const { t } = useI18n();
  const stats = calculateTokenStats(session);
  const contextLimit = session?.usage?.context_window ?? getContextLimit(stats.dominantModel);
  const lastContextTokens = session?.usage?.last_context_tokens ?? null;
  const usageRatio = contextLimit && lastContextTokens !== null ? lastContextTokens / contextLimit : null;
  const trend = session?.usage?.token_trend ?? [];
  const trendPoints: SparkPoint[] = trend
    .map((point) => ({
      total: point.total_tokens,
      input: point.input_tokens,
      output: point.output_tokens,
      cacheRead: point.cache_read_tokens,
      cacheCreation: point.cache_creation_tokens,
    }))
    .filter((point) => point.total > 0);
  const trendValues = trendPoints.map((point) => point.total);
  const inputTrend = trendPoints.map((point) => point.input ?? 0);
  const outputTrend = trendPoints.map((point) => point.output ?? 0);
  const cacheTrend = trendPoints.map((point) => (point.cacheRead ?? 0) + (point.cacheCreation ?? 0));
  const peakTokens = trendValues.length > 0 ? Math.max(...trendValues) : 0;
  const averageTokens = trendValues.length > 0 ? trendValues.reduce((sum, value) => sum + value, 0) / trendValues.length : 0;
  const remaining = contextLimit && lastContextTokens !== null ? Math.max(0, contextLimit - lastContextTokens) : null;
  const contextColor = usageRatio === null ? TERM.dim : usageRatio >= 0.8 ? TERM.red : usageRatio >= 0.5 ? TERM.yellow : TERM.green;

  if (!session) return <div className="ui-session-process-empty">{t("history.context.selectSession")}</div>;

  return (
    <div className="ui-session-context-view">
      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Cpu size={14} />
          {t("history.context.window")}
        </div>
        <div className="ui-session-context-main">
          <span>{lastContextTokens !== null ? formatCompactCount(lastContextTokens) : "—"}</span>
          <small>/ {contextLimit ? formatCompactCount(contextLimit) : t("history.context.unknownLimit")}</small>
        </div>
        {usageRatio !== null ? (
          <>
            <ProgressBar ratio={usageRatio} color={contextColor} />
            <div className="ui-session-context-subline">
              <span>{t("history.context.usedPercent", { percent: (usageRatio * 100).toFixed(1) })}</span>
              <span>{t("history.context.remaining", { value: remaining !== null ? formatCompactCount(remaining) : "—" })}</span>
            </div>
          </>
        ) : (
          <div className="ui-session-process-empty compact">{t("history.context.noWindowData")}</div>
        )}
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Layers3 size={14} />
          {t("history.context.tokenComposition")}
        </div>
        <div className="ui-session-context-token-card">
          <Donut
            size={74}
            segments={[
              { value: stats.inputTokens, color: TERM.green },
              { value: stats.outputTokens, color: TERM.yellow },
              { value: stats.cacheReadTokens, color: TERM.blue },
              { value: stats.cacheCreationTokens, color: TERM.magenta },
            ]}
          >
            <span className="ui-session-context-donut-label">{formatCompactCount(stats.totalTokens)}</span>
          </Donut>
          <div className="ui-session-process-metrics">
            <span>{t("termStats.input")} <b>{formatCompactCount(stats.inputTokens)}</b></span>
            <span>{t("termStats.output")} <b>{formatCompactCount(stats.outputTokens)}</b></span>
            <span>{t("termStats.cacheHit")} <b>{formatCompactCount(stats.cacheReadTokens)}</b></span>
            <span>{t("termStats.cacheWrite")} <b>{formatCompactCount(stats.cacheCreationTokens)}</b></span>
          </div>
        </div>
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Database size={14} />
          {t("history.context.requestStats")}
        </div>
        <div className="ui-session-process-metrics">
          <span>{t("history.context.trendPoints")} <b>{trendPoints.length}</b></span>
          <span>{t("history.context.peak")} <b>{formatCompactCount(peakTokens)}</b></span>
          <span>{t("history.context.average")} <b>{formatCompactCount(averageTokens)}</b></span>
          <span>{t("termStats.model")} <b>{stats.dominantModel ?? "—"}</b></span>
        </div>
      </section>

      <section className="ui-session-process-card">
        <div className="ui-session-process-card-title">
          <Coins size={14} />
          {t("history.context.costAndMessages")}
        </div>
        <div className="ui-session-process-metrics">
          <span>{t("termStats.estimatedCost")} <b>{formatCost(stats.estimatedCost)}</b></span>
          <span>{t("termStats.messageCount")} <b>{session.messages.length}</b></span>
          <span>{t("termStats.tools")} <b>{session.usage?.tool_call_count ?? 0}</b></span>
          <span>{t("termStats.total")} Token <b>{formatCompactCount(stats.totalTokens)}</b></span>
        </div>
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <TrendingUp size={14} />
          {t("history.context.requestTokenTrend")}
        </div>
        {trendValues.length >= 2 ? (
          <Sparkline points={trendValues} details={trendPoints} color={TERM.cyan} height={86} />
        ) : (
          <div className="ui-session-process-empty compact">{t("history.context.noTrendPoints")}</div>
        )}
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <MessageSquare size={14} />
          {t("history.context.ioCacheTrend")}
        </div>
        <div className="ui-session-context-mini-charts">
          <div>
            <span>{t("termStats.input")}</span>
            <Sparkline points={inputTrend} color={TERM.green} height={44} />
          </div>
          <div>
            <span>{t("termStats.output")}</span>
            <Sparkline points={outputTrend} color={TERM.yellow} height={44} />
          </div>
          <div>
            <span>{t("history.context.cache")}</span>
            <Sparkline points={cacheTrend} color={TERM.blue} height={44} />
          </div>
        </div>
      </section>

      <section className="ui-session-process-card wide">
        <div className="ui-session-process-card-title">
          <Layers3 size={14} />
          {t("history.context.currentTokenDistribution")}
        </div>
        <SegmentedBar
          height={10}
          parts={[
            { value: stats.inputTokens, color: TERM.green, label: t("termStats.input") },
            { value: stats.outputTokens, color: TERM.yellow, label: t("termStats.output") },
            { value: stats.cacheReadTokens, color: TERM.blue, label: t("termStats.cacheHit") },
            { value: stats.cacheCreationTokens, color: TERM.magenta, label: t("termStats.cacheWrite") },
          ]}
        />
        <div className="ui-session-context-legend">
          <span style={{ color: TERM.green }}>{t("termStats.input")}</span>
          <span style={{ color: TERM.yellow }}>{t("termStats.output")}</span>
          <span style={{ color: TERM.blue }}>{t("termStats.cacheHit")}</span>
          <span style={{ color: TERM.magenta }}>{t("termStats.cacheWrite")}</span>
        </div>
      </section>
    </div>
  );
}

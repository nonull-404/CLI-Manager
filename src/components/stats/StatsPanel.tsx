import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { Activity, BarChart3, Coins, Database, Folder, Layers, LineChart, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type {
  HistorySessionSummary,
  HistoryStatsDailySeriesItem,
  HistoryStatsHeatmapDay,
  HistoryStatsHourlyActivityItem,
  HistoryStatsModelItem,
  HistoryStatsPayload,
  HistoryStatsProjectItem,
  HistoryStatsSourceItem,
} from "../../lib/types";
import { useHistoryStore } from "../../stores/historyStore";
import { EChart } from "./EChart";
import { TimelineHeatmap } from "./TimelineHeatmap";
import { StatsHourlyActivityChart } from "./StatsHourlyActivityChart";
import { Skeleton } from "../ui/Skeleton";
import { Portal } from "../ui/Portal";
import { ACCENT, CHART_TOOLTIP, PEAK, SERIES_COLORS } from "./statsPalette";
import { useI18n, type AppLanguage, type TranslationKey } from "../../lib/i18n";

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenSession: (sessionKey: string) => Promise<void>;
}

const DAY_SESSION_PAGE_SIZE = 120;
const ALL_PROJECTS_VALUE = "__all_projects__";
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_INPUT_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_INPUT_PATTERN = /^(\d{4})$/;
const HOUR_MS = 60 * 60 * 1000;

interface DateRangeInput {
  startDate: string;
  endDate: string;
}

type StatsTimeWindowMode = "day" | "week" | "month" | "year" | "custom";
type StatsBucketGranularity = "day" | "hour";

interface StatsTimeWindowState {
  mode: StatsTimeWindowMode;
  day: string;
  week: string;
  month: string;
  year: string;
  customStart: string;
  customEnd: string;
}

const STATS_TIME_WINDOW_OPTIONS: { value: StatsTimeWindowMode; labelKey: TranslationKey }[] = [
  { value: "day", labelKey: "stats.window.day" },
  { value: "week", labelKey: "stats.window.week" },
  { value: "month", labelKey: "stats.window.month" },
  { value: "year", labelKey: "stats.window.year" },
  { value: "custom", labelKey: "stats.window.custom" },
];

function formatCount(value: number, language: AppLanguage = "zh-CN"): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(language).format(Math.max(0, Math.round(value)));
}

function formatCompactCount(value: number, language: AppLanguage = "zh-CN"): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatCount(value, language);
}

function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatDay(dayStartUtc: number, language: AppLanguage = "zh-CN"): string {
  if (!Number.isFinite(dayStartUtc) || dayStartUtc <= 0) return "-";
  return new Intl.DateTimeFormat(language, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(dayStartUtc));
}

function formatHour(hourStartUtc: number): string {
  if (!Number.isFinite(hourStartUtc) || hourStartUtc <= 0) return "-";
  const date = new Date(hourStartUtc);
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatBucketLabel(bucketStartUtc: number, granularity: StatsBucketGranularity, language: AppLanguage = "zh-CN"): string {
  return granularity === "hour" ? formatHour(bucketStartUtc) : formatDay(bucketStartUtc, language);
}

function formatDateTime(ts: number | null, language: AppLanguage = "zh-CN"): string {
  if (!ts || !Number.isFinite(ts)) return "-";
  return new Intl.DateTimeFormat(language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentSevenDaysDateRange(): DateRangeInput {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
  };
}

function getDefaultStatsTimeWindow(): StatsTimeWindowState {
  const now = new Date();
  const recentSevenDays = getRecentSevenDaysDateRange();
  return {
    mode: "week",
    day: formatDateInput(now),
    week: "",
    month: formatDateInput(now).slice(0, 7),
    year: String(now.getFullYear()),
    customStart: recentSevenDays.startDate,
    customEnd: recentSevenDays.endDate,
  };
}

function resolveStatsTimeWindow(window: StatsTimeWindowState): StatsTimeWindowState {
  const fallback = getDefaultStatsTimeWindow();
  return {
    mode: window.mode,
    day: window.day || fallback.day,
    week: window.week || fallback.week,
    month: window.month || fallback.month,
    year: window.year || fallback.year,
    customStart: window.customStart || fallback.customStart,
    customEnd: window.customEnd || fallback.customEnd,
  };
}

function nextStatsTimeWindowForMode(mode: StatsTimeWindowMode, current: StatsTimeWindowState): StatsTimeWindowState {
  const resolved = resolveStatsTimeWindow({ ...current, mode });
  if (mode !== "week") return resolved;
  const recentSevenDays = getRecentSevenDaysDateRange();
  return {
    ...resolved,
    customStart: recentSevenDays.startDate,
    customEnd: recentSevenDays.endDate,
  };
}

function dateRangeFromStatsTimeWindow(window: StatsTimeWindowState): DateRangeInput {
  if (window.mode === "day") {
    return { startDate: window.day, endDate: window.day };
  }
  if (window.mode === "week") {
    return getRecentSevenDaysDateRange();
  }
  if (window.mode === "month") {
    const match = MONTH_INPUT_PATTERN.exec(window.month);
    if (!match) return { startDate: "", endDate: "" };
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return { startDate: "", endDate: "" };
    return {
      startDate: formatDateInput(new Date(year, month - 1, 1)),
      endDate: formatDateInput(new Date(year, month, 0)),
    };
  }
  if (window.mode === "year") {
    const match = YEAR_INPUT_PATTERN.exec(window.year);
    if (!match) return { startDate: "", endDate: "" };
    const year = Number(match[1]);
    return {
      startDate: formatDateInput(new Date(year, 0, 1)),
      endDate: formatDateInput(new Date(year, 11, 31)),
    };
  }
  return {
    startDate: window.customStart,
    endDate: window.customEnd,
  };
}

function statsTimeWindowLabel(
  window: StatsTimeWindowState,
  range: DateRangeInput,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (window.mode === "day") return window.day;
  if (window.mode === "week") return t("stats.weekRange", { start: range.startDate, end: range.endDate });
  if (window.mode === "month") return t("stats.monthLabel", { month: window.month });
  if (window.mode === "year") return t("stats.yearLabel", { year: window.year });
  return t("stats.rangeLabel", { start: range.startDate, end: range.endDate });
}

function parseDateInput(value: string, endOfDay: boolean): number | null {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

function makeSessionKey(summary: HistorySessionSummary): string {
  return `${summary.source}:${summary.session_id}:${summary.file_path}`;
}

function totalTokensOf(value: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}): number {
  return value.input_tokens + value.output_tokens + value.cache_read_tokens + value.cache_creation_tokens;
}

function axisDayLabel(dayStartUtc: number): string {
  if (!Number.isFinite(dayStartUtc) || dayStartUtc <= 0) return "-";
  const date = new Date(dayStartUtc);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function axisHourLabel(hourStartUtc: number): string {
  if (!Number.isFinite(hourStartUtc) || hourStartUtc <= 0) return "-";
  return String(new Date(hourStartUtc).getHours()).padStart(2, "0");
}

function axisBucketLabel(bucketStartUtc: number, granularity: StatsBucketGranularity): string {
  return granularity === "hour" ? axisHourLabel(bucketStartUtc) : axisDayLabel(bucketStartUtc);
}

function hourlyBucketStart(item: HistoryStatsHourlyActivityItem, dayStartAt: number | null): number {
  if (Number.isFinite(item.hour_start_utc) && item.hour_start_utc > 0) return item.hour_start_utc;
  if (dayStartAt !== null && Number.isFinite(dayStartAt)) return dayStartAt + item.hour * HOUR_MS;
  return 0;
}

function hourlyToTrendItem(item: HistoryStatsHourlyActivityItem, dayStartAt: number | null): HistoryStatsDailySeriesItem {
  return {
    day_start_utc: hourlyBucketStart(item, dayStartAt),
    sessions: item.sessions,
    messages: item.messages,
    input_tokens: item.input_tokens,
    output_tokens: item.output_tokens,
    cache_read_tokens: item.cache_read_tokens,
    cache_creation_tokens: item.cache_creation_tokens,
    total_cost_usd: item.total_cost_usd,
    unpriced_tokens: item.unpriced_tokens,
  };
}

function hourlyToHeatmapDay(item: HistoryStatsHourlyActivityItem, dayStartAt: number | null): HistoryStatsHeatmapDay {
  return {
    day_start_utc: hourlyBucketStart(item, dayStartAt),
    sessions: item.sessions,
    messages: item.messages,
    level: item.level,
    session_refs: item.session_refs,
  };
}

function tooltipRows(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
  );
}

function tooltipIndex(value: Record<string, unknown> | undefined): number {
  const dataIndex = value?.dataIndex;
  return typeof dataIndex === "number" && Number.isFinite(dataIndex) ? dataIndex : 0;
}

function tooltipNumber(value: Record<string, unknown> | undefined, key: string): number {
  const result = value?.[key];
  return typeof result === "number" && Number.isFinite(result) ? result : 0;
}

function niceAxisMax(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) {
    const candidate = base * factor;
    if (candidate >= value) return candidate;
  }
  return base * 10;
}

function StatsSkeleton() {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="rounded-xl bg-bg-secondary p-3 space-y-2">
            <Skeleton className="h-2.5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl bg-bg-secondary p-4 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-[260px] w-full" />
      </Card>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
  right,
}: {
  icon: typeof BarChart3;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-bg-tertiary text-accent">
        <Icon size={14} />
      </span>
      <div className="text-[13px] font-semibold tracking-tight text-text-primary">{title}</div>
      {hint && <div className="ml-auto text-[11px] text-text-muted">{hint}</div>}
      {right}
    </div>
  );
}

function KpiStrip({ stats }: { stats: HistoryStatsPayload }) {
  const { language, t } = useI18n();
  const totalTokens = totalTokensOf({
    input_tokens: stats.total_input_tokens,
    output_tokens: stats.total_output_tokens,
    cache_read_tokens: stats.total_cache_read_tokens,
    cache_creation_tokens: stats.total_cache_creation_tokens,
  });
  const peak = stats.daily_series.reduce<HistoryStatsDailySeriesItem | null>((current, item) => {
    if (!current) return item;
    return totalTokensOf(item) > totalTokensOf(current) ? item : current;
  }, null);
  const peakTokens = peak ? totalTokensOf(peak) : 0;
  const pricedTokens = Math.max(0, totalTokens - stats.total_unpriced_tokens);
  const coverage = totalTokens > 0 ? (pricedTokens / totalTokens) * 100 : 0;

  const items = [
    {
      label: t("stats.kpi.totalToken"),
      value: formatCompactCount(totalTokens, language),
      hint: t("stats.kpi.fullValue", { value: formatCount(totalTokens, language) }),
      icon: Layers,
      accent: "var(--accent)",
    },
    {
      label: t("stats.kpi.estimatedCost"),
      value: formatCost(stats.total_cost_usd),
      hint: stats.total_unpriced_tokens > 0
        ? t("stats.kpi.unpriced", { value: formatCompactCount(stats.total_unpriced_tokens, language) })
        : t("stats.kpi.localEstimate"),
      icon: Coins,
      accent: "var(--warning)",
    },
    {
      label: t("stats.kpi.peakDay"),
      value: peak && peakTokens > 0 ? formatDay(peak.day_start_utc, language) : "-",
      hint: peak && peakTokens > 0 ? `${formatCompactCount(peakTokens, language)} Token` : t("stats.kpi.noDailyToken"),
      icon: LineChart,
      accent: "var(--accent)",
    },
    {
      label: t("stats.kpi.pricingCoverage"),
      value: totalTokens > 0 ? formatPercent(coverage) : "0%",
      hint: t("stats.kpi.coverageHint"),
      icon: Activity,
      accent: coverage >= 60 ? "var(--success)" : "var(--warning)",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="relative min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-bg-secondary px-4 py-3.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in srgb, ${item.accent} 16%, transparent)`, color: item.accent }}
              >
                <Icon size={13} />
              </span>
              <div className="text-[11px] font-medium text-text-muted">{item.label}</div>
            </div>
            <div className="mt-2 truncate text-[24px] font-semibold leading-none tracking-tight text-text-primary">
              {item.value}
            </div>
            <div className="mt-1.5 truncate text-[11px] text-text-secondary" title={item.hint}>
              {item.hint}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TokenCompositionStrip({ stats }: { stats: HistoryStatsPayload }) {
  const { language, t } = useI18n();
  const parts = [
    { key: "input", label: t("termStats.input"), value: stats.total_input_tokens, color: SERIES_COLORS.input },
    { key: "output", label: t("termStats.output"), value: stats.total_output_tokens, color: SERIES_COLORS.output },
    { key: "cacheCreation", label: t("termStats.cacheWrite"), value: stats.total_cache_creation_tokens, color: SERIES_COLORS.cacheCreation },
    { key: "cacheRead", label: t("termStats.cacheHit"), value: stats.total_cache_read_tokens, color: SERIES_COLORS.cacheRead },
  ];
  const total = Math.max(1, parts.reduce((sum, item) => sum + item.value, 0));

  return (
    <section className="rounded-2xl border border-border/60 bg-bg-secondary px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[126px]">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
            <Layers size={13} className="text-accent" />
            {t("stats.tokenComposition")}
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted">{t("stats.tokenCompositionHint")}</div>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-tertiary">
            {parts.map((item) => (
              <div
                key={item.key}
                className="h-full"
                style={{ width: `${(item.value / total) * 100}%`, backgroundColor: item.color }}
                title={`${item.label} ${formatCount(item.value, language)}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          {parts.map((item) => (
            <div key={item.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
              <span className="font-semibold text-text-primary">{formatCompactCount(item.value, language)}</span>
              <span className="text-text-muted">{formatPercent((item.value / total) * 100)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContextNote({
  sourceLabel,
  projectLabel,
  dateRangeLabel,
  stats,
}: {
  sourceLabel: string;
  projectLabel: string;
  dateRangeLabel: string;
  stats: HistoryStatsPayload;
}) {
  const { language, t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-bg-secondary px-3 py-2 text-[11px] text-text-secondary">
      <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
        <Database size={13} />
        {t("stats.context.localEstimate")}
      </span>
      <span>{t("stats.context.source", { value: sourceLabel })}</span>
      <span>{t("stats.context.project", { value: projectLabel })}</span>
      <span>{t("stats.context.range", { value: dateRangeLabel })}</span>
      <span>{t("stats.context.unpriced", { value: formatCompactCount(stats.total_unpriced_tokens, language) })}</span>
      <span className="text-text-muted">{t("stats.context.billingNote")}</span>
    </div>
  );
}

function DailyUsageTrendChart({
  items,
  granularity,
}: {
  items: HistoryStatsDailySeriesItem[];
  granularity: StatsBucketGranularity;
}) {
  const { language, t } = useI18n();
  const peak = useMemo(() => {
    const found = items.reduce<HistoryStatsDailySeriesItem | null>((current, item) => {
      if (!current) return item;
      return totalTokensOf(item) > totalTokensOf(current) ? item : current;
    }, null);
    return found && totalTokensOf(found) > 0 ? found : null;
  }, [items]);

  const hasData = items.some((item) => totalTokensOf(item) > 0 || item.total_cost_usd > 0);
  const option = useMemo<EChartsOption>(() => {
    const tokenAxisMax = niceAxisMax(
      Math.max(
        0,
        ...items.flatMap((item) => [
          totalTokensOf(item),
          item.input_tokens,
          item.output_tokens,
          item.cache_creation_tokens,
          item.cache_read_tokens,
        ])
      )
    );
    const costAxisMax = niceAxisMax(Math.max(0, ...items.map((item) => item.total_cost_usd)));
    const denseLabels = items.length > 18;
    return {
      backgroundColor: "transparent",
      animationDuration: 650,
      // 固定主折线配色：主题语义色在部分主题里 accent≈success 会撞色（总Token 与输入同色），故总/输入/输出写死区分。
      color: ["#4F9DF7", "#46C06A", "#F0617A", SERIES_COLORS.cacheCreation, SERIES_COLORS.cacheRead],
      tooltip: {
        trigger: "axis",
        confine: true,
        ...CHART_TOOLTIP,
        formatter: (params: unknown) => {
          const rows = tooltipRows(params);
          const day = items[tooltipIndex(rows[0])];
          if (!day) return "";
          const bucketLabel = formatBucketLabel(day.day_start_utc, granularity, language);
          const lineRows = rows
            .map((row) => {
              const name = typeof row.seriesName === "string" ? row.seriesName : "";
              const marker = typeof row.marker === "string" ? row.marker : "";
              const value = tooltipNumber(row, "value");
              const display = name === t("stats.trend.cost") ? formatCost(value) : `${formatCount(value, language)} Token`;
              return `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;line-height:22px;"><span>${marker}${name}</span><strong>${display}</strong></div>`;
            })
            .join("");
          return `<div style="min-width:210px;"><strong>${bucketLabel}</strong>${lineRows}<div style="margin-top:6px;color:var(--text-muted);">${t("stats.trend.unpricedTooltip", { value: formatCount(day.unpriced_tokens, language) })}</div></div>`;
        },
      },
      legend: {
        top: 0,
        right: 6,
        itemWidth: 10,
        itemHeight: 6,
        textStyle: { color: "var(--text-secondary)", fontSize: 11 },
      },
      grid: { left: 48, right: 56, top: 42, bottom: denseLabels ? 46 : 34 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: items.map((item) => axisBucketLabel(item.day_start_utc, granularity)),
        axisLine: { lineStyle: { color: "var(--border)" } },
        axisTick: { show: false },
        axisLabel: {
          interval: denseLabels ? Math.ceil(items.length / 8) : 0,
          rotate: denseLabels ? 28 : 0,
          color: "var(--text-muted)",
          hideOverlap: true,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Token",
          max: tokenAxisMax,
          nameTextStyle: { color: "var(--text-muted)", fontSize: 10 },
          splitLine: { lineStyle: { color: "var(--border)", opacity: 0.42 } },
          axisLabel: { color: "var(--text-muted)", formatter: (value: number) => formatCompactCount(value, language) },
        },
        {
          type: "value",
          name: "USD",
          max: costAxisMax,
          nameTextStyle: { color: "var(--text-muted)", fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: "var(--text-muted)", formatter: (value: number) => (value <= 0 ? "$0" : `$${value < 10 ? value.toFixed(1) : Math.round(value)}`) },
        },
      ],
      series: [
        {
          name: t("stats.trend.totalToken"),
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          emphasis: { disabled: true },
          lineStyle: { width: 3 },
          areaStyle: { color: "rgba(79,157,247,0.14)" },
          data: items.map((item) =>
            peak?.day_start_utc === item.day_start_utc
              ? { value: totalTokensOf(item), symbolSize: 12, itemStyle: { color: "#F5C84B", borderColor: "var(--bg-secondary)", borderWidth: 2 } }
              : totalTokensOf(item)
          ),
        },
        { name: t("termStats.input"), type: "line", smooth: true, symbol: "none", emphasis: { disabled: true }, lineStyle: { width: 1.8 }, data: items.map((item) => item.input_tokens) },
        { name: t("termStats.output"), type: "line", smooth: true, symbol: "none", emphasis: { disabled: true }, lineStyle: { width: 1.8 }, data: items.map((item) => item.output_tokens) },
        { name: t("termStats.cacheWrite"), type: "line", smooth: true, symbol: "none", emphasis: { disabled: true }, lineStyle: { width: 1.8 }, data: items.map((item) => item.cache_creation_tokens) },
        { name: t("termStats.cacheHit"), type: "line", smooth: true, symbol: "none", emphasis: { disabled: true }, lineStyle: { width: 1.8 }, data: items.map((item) => item.cache_read_tokens) },
        {
          name: t("stats.trend.cost"),
          type: "bar",
          yAxisIndex: 1,
          barMaxWidth: 12,
          emphasis: { disabled: true },
          itemStyle: { color: "rgba(148,163,184,0.32)", borderRadius: [5, 5, 0, 0] },
          data: items.map((item) => Number(item.total_cost_usd.toFixed(4))),
        },
      ],
    };
  }, [items, peak, granularity, language, t]);

  return (
    <section className="rounded-2xl border border-border/60 bg-bg-secondary p-4 lg:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-bg-tertiary text-accent">
          <LineChart size={14} />
        </span>
        <div>
          <div className="text-[14px] font-semibold tracking-tight text-text-primary">{t("stats.trend.title")}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            {granularity === "hour" ? t("stats.trend.hourHint") : t("stats.trend.dayHint")}
          </div>
        </div>
        <div className="ml-auto rounded-full border border-border/60 bg-bg-primary px-3 py-1 text-[11px] font-medium text-text-secondary">
          {peak
            ? t("stats.trend.peak", {
                bucket: formatBucketLabel(peak.day_start_utc, granularity, language),
                tokens: formatCount(totalTokensOf(peak), language),
              })
            : t("stats.trend.noPeak")}
        </div>
      </div>
      {hasData ? <EChart option={option} className="h-[380px] w-full" /> : <EmptyBlock text={t("stats.trend.empty")} />}
    </section>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-lg bg-bg-primary py-8 text-center text-[12px] text-text-muted">{text}</div>;
}

function ModelRankingChart({ items }: { items: HistoryStatsModelItem[] }) {
  const { language, t } = useI18n();
  const models = useMemo(
    () =>
      items
        .filter((item) => totalTokensOf(item) > 0)
        .slice(0, 8)
        .reverse(),
    [items]
  );
  const option = useMemo<EChartsOption>(() => {
    const tokenAxisMax = niceAxisMax(Math.max(0, ...models.map(totalTokensOf)));
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        confine: true,
        ...CHART_TOOLTIP,
        formatter: (params: unknown) => {
          const row = tooltipRows(params)[0];
          const model = models[tooltipIndex(row)];
          if (!model) return "";
          return `<div style="min-width:220px;"><strong>${model.model}</strong><div style="margin-top:6px;">${t("stats.modelRanking.tooltip", {
            tokens: formatCount(totalTokensOf(model), language),
            cost: formatCost(model.total_cost_usd),
            cache: formatCount(model.cache_creation_tokens + model.cache_read_tokens, language),
          })}</div></div>`;
        },
      },
      grid: { left: 112, right: 54, top: 14, bottom: 24 },
      xAxis: {
        type: "value",
        max: tokenAxisMax,
        splitLine: { lineStyle: { color: "var(--border)", opacity: 0.42 } },
        axisLabel: { color: "var(--text-muted)", formatter: (value: number) => formatCompactCount(value, language) },
      },
      yAxis: {
        type: "category",
        data: models.map((item) => item.model),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "var(--text-secondary)", width: 104, overflow: "truncate", formatter: (value: string) => value.replace(/^claude-/, "") },
      },
      series: [
        {
          name: "Token",
          type: "bar",
          barWidth: 14,
          itemStyle: { color: ACCENT, borderRadius: [0, 7, 7, 0] },
          label: {
            show: true,
            position: "right",
            color: "var(--text-muted)",
            fontSize: 10,
            formatter: (params: unknown) => formatCompactCount(tooltipNumber(params as Record<string, unknown>, "value"), language),
          },
          data: models.map((item, index) => ({
            value: totalTokensOf(item),
            itemStyle: { color: index === models.length - 1 ? PEAK : ACCENT },
          })),
        },
      ],
    };
  }, [models, language, t]);

  return (
    <section className="flex h-[320px] flex-col rounded-2xl border border-border/60 bg-bg-secondary p-4">
      <SectionHeading icon={BarChart3} title={t("stats.modelRanking")} hint="Top models by Token" />
      <div className="min-h-0 flex-1">
        {models.length === 0 ? <EmptyBlock text={t("stats.modelRanking.empty")} /> : <EChart option={option} className="h-full w-full" />}
      </div>
    </section>
  );
}

function ProjectRanking({ items, selectedProjectKey, onSelectProject, onClearProject }: {
  items: HistoryStatsProjectItem[];
  selectedProjectKey: string;
  onSelectProject: (projectKey: string) => void;
  onClearProject: () => void;
}) {
  const { language, t } = useI18n();
  const topItems = items.slice(0, 8);
  const maxTokens = Math.max(1, ...topItems.map(totalTokensOf));
  return (
    <section className="flex h-[320px] flex-col rounded-2xl border border-border/60 bg-bg-secondary p-4">
      <SectionHeading
        icon={Folder}
        title={t("stats.projectRanking")}
        right={
          selectedProjectKey ? (
            <Button className="ml-auto" onClick={onClearProject} size="sm" variant="ghost">
              {t("stats.projectRanking.clear")}
            </Button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto ui-thin-scroll pr-1">
        {topItems.length === 0 ? (
          <EmptyBlock text={t("stats.projectRanking.empty")} />
        ) : (
          <div className="space-y-2">
            {topItems.map((item) => {
              const selected = item.project_key === selectedProjectKey;
              const totalTokens = totalTokensOf(item);
              return (
                <button
                  key={item.project_key}
                  type="button"
                  onClick={() => onSelectProject(item.project_key)}
                  className="ui-list-row w-full rounded-lg bg-bg-primary px-3 py-2 text-left"
                  aria-pressed={selected}
                  title={t("stats.projectRanking.filterTitle", { project: item.project_key })}
                >
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate font-medium text-text-primary">{item.project_key}</span>
                    <span className="shrink-0 text-text-muted">{formatCompactCount(totalTokens, language)} Token · {formatCost(item.total_cost_usd)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (totalTokens / maxTokens) * 100)}%`,
                        backgroundColor: selected ? PEAK : ACCENT,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function SourceBreakdown({ items }: { items: HistoryStatsSourceItem[] }) {
  const { language, t } = useI18n();
  const maxTokens = Math.max(1, ...items.map(totalTokensOf));
  return (
    <section className="flex h-[320px] flex-col rounded-2xl border border-border/60 bg-bg-secondary p-4">
      <SectionHeading icon={Database} title={t("stats.sourceBreakdown")} hint="Claude / Codex" />
      <div className="min-h-0 flex-1 overflow-y-auto ui-thin-scroll pr-1">
        {items.length === 0 ? (
          <EmptyBlock text={t("stats.sourceBreakdown.empty")} />
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const totalTokens = totalTokensOf(item);
              return (
                <div key={item.source} className="rounded-lg bg-bg-primary px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="font-medium text-text-primary">{item.source}</span>
                    <span className="text-text-muted">{formatCompactCount(totalTokens, language)} Token · {formatCost(item.total_cost_usd)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (totalTokens / maxTokens) * 100)}%`, backgroundColor: ACCENT }} />
                  </div>
                  <div className="mt-1 text-[10px] text-text-muted">
                    {t("stats.sourceBreakdown.detail", {
                      input: formatCompactCount(item.input_tokens, language),
                      output: formatCompactCount(item.output_tokens, language),
                      cache: formatCompactCount(item.cache_creation_tokens + item.cache_read_tokens, language),
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function StatsPanel({ open, onClose, onOpenSession }: StatsPanelProps) {
  const { language, t } = useI18n();
  const loadingStats = useHistoryStore((s) => s.loadingStats);
  const loadingStatsProjectOptions = useHistoryStore((s) => s.loadingStatsProjectOptions);
  const stats = useHistoryStore((s) => s.stats);
  const statsError = useHistoryStore((s) => s.statsError);
  const statsProjectOptionsError = useHistoryStore((s) => s.statsProjectOptionsError);
  const statsUpdatedAt = useHistoryStore((s) => s.statsUpdatedAt);
  const sourceFilter = useHistoryStore((s) => s.sourceFilter);
  const projectOptions = useHistoryStore((s) => s.statsProjectOptions);
  const loadStatsProjectOptions = useHistoryStore((s) => s.loadStatsProjectOptions);
  const loadStats = useHistoryStore((s) => s.loadStats);

  const [projectKey, setProjectKey] = useState("");
  const [projectSelectionTouched, setProjectSelectionTouched] = useState(false);
  const [projectOptionsReady, setProjectOptionsReady] = useState(false);
  const [projectSelectionReady, setProjectSelectionReady] = useState(false);
  const [timeWindow, setTimeWindow] = useState<StatsTimeWindowState>(() => getDefaultStatsTimeWindow());
  const [requestedStatsQueryKey, setRequestedStatsQueryKey] = useState<string | null>(null);
  const [selectedDayStart, setSelectedDayStart] = useState<number | null>(null);
  const [dayVisibleCount, setDayVisibleCount] = useState(DAY_SESSION_PAGE_SIZE);
  const resolvedTimeWindow = useMemo(() => resolveStatsTimeWindow(timeWindow), [timeWindow]);
  const dateRange = useMemo(() => dateRangeFromStatsTimeWindow(resolvedTimeWindow), [resolvedTimeWindow]);

  const dateBounds = useMemo(() => {
    const startAt = parseDateInput(dateRange.startDate, false);
    const endAt = parseDateInput(dateRange.endDate, true);
    if (!dateRange.startDate || !dateRange.endDate) return { startAt, endAt, error: t("stats.rangeInvalid.missing") };
    if (startAt === null || endAt === null) return { startAt, endAt, error: t("stats.rangeInvalid.format") };
    if (endAt < startAt) return { startAt, endAt, error: t("stats.rangeInvalid.order") };
    return { startAt, endAt, error: null };
  }, [dateRange.endDate, dateRange.startDate, t]);

  const dateRangeLabel = dateBounds.error ? t("stats.rangeInactive") : statsTimeWindowLabel(resolvedTimeWindow, dateRange, t);
  const statsQueryKey = useMemo(
    () => `${sourceFilter}|${projectKey || ALL_PROJECTS_VALUE}|${dateBounds.startAt ?? "invalid"}|${dateBounds.endAt ?? "invalid"}`,
    [dateBounds.endAt, dateBounds.startAt, projectKey, sourceFilter]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProjectOptionsReady(false);
    setProjectSelectionReady(false);
    void loadStatsProjectOptions()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProjectOptionsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceFilter, loadStatsProjectOptions]);

  useEffect(() => {
    if (!open) return;
    setProjectKey("");
    setProjectSelectionTouched(false);
    setTimeWindow(getDefaultStatsTimeWindow());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setProjectSelectionTouched(false);
  }, [open, sourceFilter]);

  useEffect(() => {
    if (!open || !projectOptionsReady) return;
    setProjectKey((prev) => {
      if (!projectSelectionTouched) return "";
      if (prev === "") return "";
      if (projectOptions.includes(prev)) return prev;
      return "";
    });
    setProjectSelectionReady(true);
  }, [open, projectOptions, projectOptionsReady, projectSelectionTouched]);

  useEffect(() => {
    if (!open) return;
    setSelectedDayStart(null);
    setDayVisibleCount(DAY_SESSION_PAGE_SIZE);
  }, [open, sourceFilter, projectKey, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    if (!open || !projectSelectionReady || dateBounds.error || dateBounds.startAt === null || dateBounds.endAt === null) {
      setRequestedStatsQueryKey(null);
      return;
    }
    const request = loadStats({ projectKey: projectKey || null, startAt: dateBounds.startAt, endAt: dateBounds.endAt });
    setRequestedStatsQueryKey(statsQueryKey);
    void request.catch(() => undefined);
  }, [open, projectSelectionReady, projectKey, sourceFilter, dateBounds, statsQueryKey, loadStats]);

  useEffect(() => {
    setDayVisibleCount(DAY_SESSION_PAGE_SIZE);
  }, [selectedDayStart]);

  const sourceLabel = sourceFilter === "all" ? t("common.allSources") : sourceFilter;
  const projectLabel = projectKey || t("common.allProjects");
  const waitingForStatsQuery = dateBounds.error === null && (!projectSelectionReady || requestedStatsQueryKey !== statsQueryKey);
  const statsGranularity: StatsBucketGranularity = resolvedTimeWindow.mode === "day" ? "hour" : "day";
  const trendItems = useMemo(() => {
    if (!stats) return [];
    if (statsGranularity === "hour") {
      return stats.hourly_activity.map((item) => hourlyToTrendItem(item, dateBounds.startAt));
    }
    return stats.daily_series;
  }, [dateBounds.startAt, stats, statsGranularity]);
  const heatmapItems = useMemo(() => {
    if (!stats) return [];
    if (statsGranularity === "hour") {
      return stats.hourly_activity.map((item) => hourlyToHeatmapDay(item, dateBounds.startAt));
    }
    return stats.heatmap;
  }, [dateBounds.startAt, stats, statsGranularity]);
  const selectedBucket = useMemo(() => {
    if (selectedDayStart === null) return null;
    return heatmapItems.find((item) => item.day_start_utc === selectedDayStart) ?? null;
  }, [heatmapItems, selectedDayStart]);
  const visibleBucketSessions = useMemo(
    () => selectedBucket?.session_refs.slice(0, dayVisibleCount) ?? [],
    [dayVisibleCount, selectedBucket]
  );
  const heatmapTitle = statsGranularity === "hour" ? t("stats.heatmap.hourTitle") : t("stats.heatmap.dayTitle");
  const selectedBucketTitle = selectedBucket
    ? t("stats.bucket.sessionTitle", { bucket: formatBucketLabel(selectedBucket.day_start_utc, statsGranularity, language) })
    : statsGranularity === "hour"
      ? t("stats.bucket.hourSelect")
      : t("stats.bucket.daySelect");
  const emptyBucketText = statsGranularity === "hour" ? t("stats.bucket.hourEmpty") : t("stats.bucket.dayEmpty");
  const selectHintText =
    statsGranularity === "hour"
      ? t("stats.bucket.hourHint")
      : t("stats.bucket.dayHint");

  useEffect(() => {
    if (selectedDayStart === null) return;
    if (!heatmapItems.some((item) => item.day_start_utc === selectedDayStart)) {
      setSelectedDayStart(null);
      setDayVisibleCount(DAY_SESSION_PAGE_SIZE);
    }
  }, [heatmapItems, selectedDayStart]);

  const refreshStats = () => {
    if (!projectSelectionReady || dateBounds.error || dateBounds.startAt === null || dateBounds.endAt === null) return;
    const request = loadStats({ projectKey: projectKey || null, startAt: dateBounds.startAt, endAt: dateBounds.endAt, force: true });
    setRequestedStatsQueryKey(statsQueryKey);
    void request.catch(() => undefined);
  };
  const controlClass = "h-8 rounded-md border border-border bg-bg-secondary px-2 text-xs text-text-primary";
  const timeInputClass = `${controlClass} min-w-[132px]`;

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 57, backgroundColor: "rgba(0, 0, 0, 0.45)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <Card className="ui-stats-panel flex h-[min(90vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-bg-primary">
          <div className="ui-stats-panel-header flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
                <span className="ui-stats-panel-badge">
                  <BarChart3 size={15} />
                </span>
                {t("stats.title")}
              </div>
              <div className="ui-dev-label mt-1 text-[11px] text-text-muted">{t("stats.subtitle")}</div>
            </div>
            <Button onClick={onClose} aria-label={t("stats.closeDashboard")} size="icon" variant="ghost" title={t("common.close")}>
              <X size={14} />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <Select
              value={projectKey || ALL_PROJECTS_VALUE}
              onChange={(e) => {
                const next = e.target.value;
                setProjectSelectionTouched(true);
                setProjectKey(next === ALL_PROJECTS_VALUE ? "" : next);
              }}
              disabled={!projectOptionsReady && loadingStatsProjectOptions}
              className="h-8 w-auto min-w-[124px] shrink-0 text-xs"
              aria-label={t("stats.projectFilter")}
            >
              <option value={ALL_PROJECTS_VALUE}>{t("common.allProjects")}</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>{project}</option>
              ))}
            </Select>

            <Select
              value={timeWindow.mode}
              onChange={(e) => setTimeWindow((prev) => nextStatsTimeWindowForMode(e.target.value as StatsTimeWindowMode, prev))}
              className={`${controlClass} w-auto min-w-[92px] shrink-0`}
              aria-label={t("stats.timeWindow")}
            >
              {STATS_TIME_WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>

            {timeWindow.mode === "day" && (
              <input
                type="date"
                value={resolvedTimeWindow.day}
                onChange={(e) => setTimeWindow((prev) => ({ ...prev, day: e.target.value }))}
                className={timeInputClass}
                aria-label={t("stats.date")}
              />
            )}

            {timeWindow.mode === "week" && (
              <span className={`${controlClass} inline-flex items-center`}>{t("stats.weekLabel")}</span>
            )}

            {timeWindow.mode === "month" && (
              <input
                type="month"
                value={resolvedTimeWindow.month}
                onChange={(e) => setTimeWindow((prev) => ({ ...prev, month: e.target.value }))}
                className={timeInputClass}
                aria-label={t("stats.month")}
              />
            )}

            {timeWindow.mode === "year" && (
              <input
                type="number"
                min="2000"
                max="9999"
                value={resolvedTimeWindow.year}
                onChange={(e) => setTimeWindow((prev) => ({ ...prev, year: e.target.value }))}
                className={`${controlClass} w-[92px]`}
                aria-label={t("stats.year")}
              />
            )}

            {timeWindow.mode === "custom" && (
              <>
                <input
                  type="date"
                  value={resolvedTimeWindow.customStart}
                  onChange={(e) => setTimeWindow((prev) => ({ ...prev, customStart: e.target.value }))}
                  className={timeInputClass}
                  aria-label={t("stats.customStart")}
                />
                <span className="text-[11px] text-text-muted">{t("common.to")}</span>
                <input
                  type="date"
                  value={resolvedTimeWindow.customEnd}
                  onChange={(e) => setTimeWindow((prev) => ({ ...prev, customEnd: e.target.value }))}
                  className={timeInputClass}
                  aria-label={t("stats.customEnd")}
                />
              </>
            )}

            <Button onClick={refreshStats} disabled={!projectSelectionReady || dateBounds.error !== null || waitingForStatsQuery} aria-label={t("common.refresh")} size="sm">
              <RefreshCw size={12} className={loadingStats ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
            <div className="ml-auto text-[12px] font-medium text-text-secondary">
              {t("stats.lastRefresh", { value: waitingForStatsQuery ? "-" : formatDateTime(statsUpdatedAt, language) })}
            </div>
            <div className="w-full text-[12px] font-medium text-text-secondary">{t("stats.currentRange", { value: dateRangeLabel })}</div>
            {dateBounds.error && <div className="w-full text-[12px] font-medium text-danger">{dateBounds.error}</div>}
            {statsProjectOptionsError && <div className="w-full text-[12px] font-medium text-danger">{t("stats.projectOptionsFailed", { error: statsProjectOptionsError })}</div>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            {(waitingForStatsQuery || (loadingStats && !stats)) && <StatsSkeleton />}

            {!waitingForStatsQuery && !loadingStats && statsError && (
              <section className="rounded-2xl border border-border/60 bg-bg-secondary p-4 text-[12px] text-danger space-y-2">
                <div>{t("stats.loadFailed", { error: statsError })}</div>
                <Button onClick={refreshStats} disabled={dateBounds.error !== null} size="sm">
                  <RefreshCw size={12} />
                  {t("common.retry")}
                </Button>
              </section>
            )}

            {!waitingForStatsQuery && stats && (
              <>
                {loadingStats && <div className="text-[12px] font-medium text-text-muted">{t("stats.updating")}</div>}
                <KpiStrip stats={stats} />
                <TokenCompositionStrip stats={stats} />
                <ContextNote sourceLabel={sourceLabel} projectLabel={projectLabel} dateRangeLabel={dateRangeLabel} stats={stats} />
                <DailyUsageTrendChart items={trendItems} granularity={statsGranularity} />

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <ProjectRanking
                    items={stats.project_ranking}
                    selectedProjectKey={projectKey}
                    onSelectProject={(nextProjectKey) => {
                      setProjectSelectionTouched(true);
                      setProjectKey((prev) => (prev === nextProjectKey ? "" : nextProjectKey));
                    }}
                    onClearProject={() => {
                      setProjectSelectionTouched(true);
                      setProjectKey("");
                    }}
                  />
                  <ModelRankingChart items={stats.model_distribution} />
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <SourceBreakdown items={stats.source_distribution} />
                  <StatsHourlyActivityChart items={stats.hourly_activity} />
                </div>

                <section className="rounded-2xl border border-border/60 bg-bg-secondary p-4">
                  <SectionHeading icon={Activity} title={heatmapTitle} />
                  <TimelineHeatmap
                    days={heatmapItems}
                    selectedDayStart={selectedDayStart}
                    onSelectDay={(day) => setSelectedDayStart(day.day_start_utc)}
                    granularity={statsGranularity}
                  />
                </section>

                <section className="rounded-2xl border border-border/60 bg-bg-secondary p-4">
                  <SectionHeading icon={Layers} title={selectedBucketTitle} />
                  {!selectedBucket && <div className="text-[12px] font-medium text-text-muted">{selectHintText}</div>}
                  {selectedBucket && selectedBucket.session_refs.length === 0 && <div className="text-[12px] font-medium text-text-muted">{emptyBucketText}</div>}
                  {visibleBucketSessions.map((session) => (
                    <button
                      key={makeSessionKey(session)}
                      onClick={() => {
                        void onOpenSession(makeSessionKey(session)).then(() => onClose());
                      }}
                      className="ui-list-row w-full border-b border-border py-2 text-left last:border-b-0"
                    >
                      <div className="truncate text-[13px] font-semibold text-text-primary">{session.title}</div>
                      <div className="ui-dev-label mt-0.5 text-[11px] text-text-muted">
                        {session.source} · {session.project_key} · {t("stats.session.messageCount", { count: session.message_count })}
                      </div>
                    </button>
                  ))}
                  {selectedBucket && dayVisibleCount < selectedBucket.session_refs.length && (
                    <Button onClick={() => setDayVisibleCount((prev) => prev + DAY_SESSION_PAGE_SIZE)} className="mt-2 w-full" size="sm">
                      {t("stats.session.loadMore", { shown: dayVisibleCount, total: selectedBucket.session_refs.length })}
                    </Button>
                  )}
                </section>
              </>
            )}
          </div>
        </Card>
      </div>
    </Portal>
  );
}

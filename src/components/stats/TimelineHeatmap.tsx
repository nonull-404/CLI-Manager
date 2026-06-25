import { memo, useMemo, useState } from "react";
import type { HistoryStatsHeatmapDay } from "../../lib/types";
import { useI18n, type AppLanguage } from "../../lib/i18n";

interface TimelineHeatmapProps {
  days: HistoryStatsHeatmapDay[];
  selectedDayStart: number | null;
  onSelectDay: (day: HistoryStatsHeatmapDay) => void;
  granularity?: "day" | "hour";
}

// 模块级 formatter 单例：原代码在 N 个 cell 上各 toLocaleDateString，每次都新建 ICU formatter。
// 短范围（≤14 天）的日热力图只有寥寥几格，铺在宽容器里非常空旷。
// 此时改用横向条形：每天一条，长度按最大值归一化铺满整行，颜色仍按活跃等级。
const BAR_MODE_MAX_DAYS = 14;

function formatDay(dayStartUtc: number, language: AppLanguage): string {
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

function formatBucket(dayStartUtc: number, granularity: "day" | "hour", language: AppLanguage): string {
  return granularity === "hour" ? formatHour(dayStartUtc) : formatDay(dayStartUtc, language);
}

function formatCount(value: number, language: AppLanguage): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(language).format(value);
}

function cellColor(level: number): string {
  if (level <= 0) return "var(--bg-tertiary)";
  if (level === 1) return "color-mix(in srgb, var(--accent) 24%, var(--bg-tertiary))";
  if (level === 2) return "color-mix(in srgb, var(--accent) 42%, var(--bg-tertiary))";
  if (level === 3) return "color-mix(in srgb, var(--accent) 62%, var(--bg-tertiary))";
  return "color-mix(in srgb, var(--accent) 82%, var(--bg-tertiary))";
}

export const TimelineHeatmap = memo(TimelineHeatmapImpl);

function TimelineHeatmapImpl({
  days,
  selectedDayStart,
  onSelectDay,
  granularity = "day",
}: TimelineHeatmapProps) {
  const { language, t } = useI18n();
  const [hoverDayStart, setHoverDayStart] = useState<number | null>(null);
  const barMode = granularity === "day" && days.length > 0 && days.length <= BAR_MODE_MAX_DAYS;

  const gridClass =
    granularity === "hour"
      ? "grid grid-cols-12 gap-1 min-w-[214px]"
      : "grid grid-flow-col auto-cols-[14px] grid-rows-7 gap-1 min-w-max";

  const cells = useMemo(() => {
    if (days.length === 0 || barMode) {
      return [] as Array<
        { type: "pad" } | { type: "day"; day: HistoryStatsHeatmapDay; dayIndex: number }
      >;
    }
    if (granularity === "hour") {
      return days.map((day, dayIndex) => ({ type: "day" as const, day, dayIndex }));
    }
    const first = new Date(days[0].day_start_utc);
    const mondayBasedWeekday = (first.getDay() + 6) % 7;
    const placeholders: Array<{ type: "pad" }> = Array.from({ length: mondayBasedWeekday }, () => ({
      type: "pad",
    }));
    const dayCells = days.map((day, dayIndex) => ({ type: "day" as const, day, dayIndex }));
    return [...placeholders, ...dayCells];
  }, [days, granularity, barMode]);

  const maxMessages = useMemo(
    () => Math.max(1, ...days.map((day) => day.messages)),
    [days]
  );

  const activeDay = useMemo(() => {
    const activeKey = hoverDayStart ?? selectedDayStart;
    if (activeKey !== null) {
      const found = days.find((day) => day.day_start_utc === activeKey);
      if (found) return found;
    }
    return days[days.length - 1] ?? null;
  }, [days, hoverDayStart, selectedDayStart]);

  if (days.length === 0) {
    return (
      <div className="py-8 text-center text-[11px] text-text-muted">
        {t("stats.heatmap.empty")}
      </div>
    );
  }

  const summary = (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
      <div className="text-[11px] text-text-secondary">
        {activeDay
          ? t("stats.summary.sessionsMessages", {
              bucket: formatBucket(activeDay.day_start_utc, granularity, language),
              sessions: formatCount(activeDay.sessions, language),
              messages: formatCount(activeDay.messages, language),
            })
          : "-"}
      </div>
    </div>
  );

  const hint = (
    <div className="mt-2 flex items-center justify-between">
      <div className="text-[10px] text-text-muted">
        {t("stats.heatmap.hint")}
      </div>
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="inline-block h-[10px] w-[10px] rounded-[2px]"
            style={{ backgroundColor: cellColor(level) }}
            title={level === 0 ? t("stats.heatmap.noActivity") : t("stats.heatmap.level", { level })}
          />
        ))}
      </div>
    </div>
  );

  if (barMode) {
    return (
      <div>
        {summary}
        <div
          className="flex flex-col gap-1.5 rounded border border-border bg-bg-primary p-2"
          role="group"
          aria-label={t("stats.heatmap.barAria", { count: days.length })}
          onMouseLeave={() => setHoverDayStart(null)}
        >
          {days.map((day, dayIndex) => {
            const selected = day.day_start_utc === selectedDayStart;
            const hovered = day.day_start_utc === hoverDayStart;
            const pct = Math.max(day.messages > 0 ? 4 : 0, (day.messages / maxMessages) * 100);
            return (
              <button
                key={day.day_start_utc}
                type="button"
                onClick={() => onSelectDay(day)}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors"
                style={{ backgroundColor: hovered || selected ? "var(--bg-tertiary)" : "transparent" }}
                aria-label={t("stats.summary.sessionsMessages", {
                  bucket: formatDay(day.day_start_utc, language),
                  sessions: formatCount(day.sessions, language),
                  messages: formatCount(day.messages, language),
                })}
                title={t("stats.summary.sessionsMessages", {
                  bucket: formatDay(day.day_start_utc, language),
                  sessions: formatCount(day.sessions, language),
                  messages: formatCount(day.messages, language),
                })}
                data-day-index={dayIndex}
                onMouseEnter={() => setHoverDayStart(day.day_start_utc)}
                onFocus={() => setHoverDayStart(day.day_start_utc)}
                onBlur={() => setHoverDayStart(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectDay(day);
                    return;
                  }
                  let delta = 0;
                  if (event.key === "ArrowUp") delta = -1;
                  if (event.key === "ArrowDown") delta = 1;
                  if (delta === 0) return;
                  event.preventDefault();
                  const nextIndex = Math.max(0, Math.min(days.length - 1, dayIndex + delta));
                  const container = event.currentTarget.parentElement;
                  const nextButton = container?.querySelector<HTMLButtonElement>(
                    `button[data-day-index='${nextIndex}']`
                  );
                  nextButton?.focus();
                }}
              >
                <span className="w-12 shrink-0 text-right text-[10px] text-text-muted">
                  {formatDay(day.day_start_utc, language)}
                </span>
                <span className="relative h-5 flex-1 overflow-hidden rounded bg-bg-tertiary/60">
                  <span
                    className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cellColor(Math.max(day.level, day.messages > 0 ? 1 : 0)),
                      boxShadow: selected ? "inset 0 0 0 1px var(--accent)" : "none",
                    }}
                  />
                  <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-medium text-text-secondary">
                    {t("stats.unit.messages", { count: formatCount(day.messages, language) })} · {t("stats.unit.sessions", { count: formatCount(day.sessions, language) })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div>
      {summary}

      <div
        className="overflow-x-auto rounded border border-border bg-bg-primary p-2"
        onMouseLeave={() => setHoverDayStart(null)}
      >
        <div
          className={gridClass}
          role="group"
          aria-label={granularity === "hour" ? t("stats.heatmap.hourAria") : t("stats.heatmap.recentAria", { count: days.length })}
        >
          {cells.map((item, idx) => {
            if (item.type === "pad") {
              return (
                <div
                  key={`pad-${idx}`}
                  className="h-[14px] w-[14px] rounded-[3px]"
                  style={{ backgroundColor: "transparent" }}
                />
              );
            }
            const day = item.day;
            const dayIndex = item.dayIndex;
            const selected = day.day_start_utc === selectedDayStart;
            const hovered = day.day_start_utc === hoverDayStart;
            return (
              <button
                key={day.day_start_utc}
                type="button"
                onClick={() => onSelectDay(day)}
                className="h-[14px] w-[14px] rounded-[3px] border transition-all"
                style={{
                  borderColor: selected ? "var(--accent)" : hovered ? "var(--border)" : "transparent",
                  backgroundColor: cellColor(day.level),
                  transform: hovered || selected ? "scale(1.08)" : "scale(1)",
                  boxShadow: selected
                    ? "0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent)"
                    : "none",
                }}
                aria-label={t("stats.summary.sessionsMessages", {
                  bucket: formatBucket(day.day_start_utc, granularity, language),
                  sessions: formatCount(day.sessions, language),
                  messages: formatCount(day.messages, language),
                })}
                title={t("stats.summary.sessionsMessages", {
                  bucket: formatBucket(day.day_start_utc, granularity, language),
                  sessions: formatCount(day.sessions, language),
                  messages: formatCount(day.messages, language),
                })}
                data-day-index={dayIndex}
                onMouseEnter={() => setHoverDayStart(day.day_start_utc)}
                onFocus={() => setHoverDayStart(day.day_start_utc)}
                onBlur={() => setHoverDayStart(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectDay(day);
                    return;
                  }
                  let delta = 0;
                  if (event.key === "ArrowLeft") delta = granularity === "hour" ? -1 : -7;
                  if (event.key === "ArrowRight") delta = granularity === "hour" ? 1 : 7;
                  if (event.key === "ArrowUp") delta = granularity === "hour" ? -12 : -1;
                  if (event.key === "ArrowDown") delta = granularity === "hour" ? 12 : 1;
                  if (delta === 0) return;
                  event.preventDefault();
                  const nextIndex = Math.max(0, Math.min(days.length - 1, dayIndex + delta));
                  const container = event.currentTarget.parentElement;
                  const nextButton = container?.querySelector<HTMLButtonElement>(
                    `button[data-day-index='${nextIndex}']`
                  );
                  nextButton?.focus();
                }}
              />
            );
          })}
        </div>
      </div>

      {hint}
      <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
        <span>{formatBucket(days[0]?.day_start_utc ?? 0, granularity, language)}</span>
        <span>{formatBucket(days[days.length - 1]?.day_start_utc ?? 0, granularity, language)}</span>
      </div>
    </div>
  );
}

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryStatsHourlyActivityItem } from "../../lib/types";
import { useI18n, type AppLanguage } from "../../lib/i18n";

interface StatsHourlyActivityChartProps {
  items: HistoryStatsHourlyActivityItem[];
}

// 单指标固定色：会话(0-3) 与消息(上千) 量级悬殊、不是趋势关系，故只画消息柱，会话进 tooltip/摘要。
const BAR_COLOR = "#46C06A";

function formatCount(value: number, language: AppLanguage): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(language).format(value);
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export const StatsHourlyActivityChart = memo(StatsHourlyActivityChartImpl);

function StatsHourlyActivityChartImpl({ items }: StatsHourlyActivityChartProps) {
  const { language, t } = useI18n();
  const [activeHour, setActiveHour] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 响应式宽度：用 ResizeObserver 测容器实际宽度，几何按宽度自适应，铺满容器、无横向滚动条。
  const [width, setWidth] = useState(620);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setWidth(Math.max(280, el.clientWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const normalized = useMemo(() => {
    if (items.length === 24) return items;
    const byHour = new Map<number, HistoryStatsHourlyActivityItem>();
    for (const item of items) byHour.set(item.hour, item);
    const full: HistoryStatsHourlyActivityItem[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      full.push(
        byHour.get(hour) ?? {
          hour,
          hour_start_utc: 0,
          sessions: 0,
          messages: 0,
          level: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          total_cost_usd: 0,
          unpriced_tokens: 0,
          session_refs: [],
        }
      );
    }
    return full;
  }, [items]);

  const chart = useMemo(() => {
    const height = 220;
    const paddingLeft = 28;
    const paddingTop = 14;
    const paddingBottom = 26;
    const paddingRight = 8;
    const innerHeight = height - paddingTop - paddingBottom;
    const innerWidth = Math.max(0, width - paddingLeft - paddingRight);
    const maxValue = Math.max(1, ...normalized.map((item) => item.messages));
    const slotWidth = innerWidth / 24;
    const barWidth = Math.max(2, slotWidth * 0.6);
    const points = normalized.map((item, index) => {
      const slotX = paddingLeft + index * slotWidth;
      const center = slotX + slotWidth / 2;
      const barHeight = (item.messages / maxValue) * innerHeight;
      return {
        item,
        index,
        slotX,
        center,
        barX: center - barWidth / 2,
        barY: paddingTop + innerHeight - barHeight,
        barHeight,
      };
    });
    return {
      width,
      height,
      paddingLeft,
      paddingTop,
      paddingBottom,
      paddingRight,
      innerHeight,
      maxValue,
      slotWidth,
      barWidth,
      points,
    };
  }, [normalized, width]);

  const active = useMemo(() => {
    if (activeHour !== null) {
      const found = normalized.find((item) => item.hour === activeHour);
      if (found) return found;
    }
    return normalized.find((item) => item.messages > 0 || item.sessions > 0) ?? normalized[0] ?? null;
  }, [activeHour, normalized]);

  const tooltipPoint = activeHour !== null ? chart.points[activeHour] : null;

  return (
    <div className="flex h-[320px] flex-col rounded-2xl border border-border/60 bg-bg-secondary p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-xs font-semibold text-text-primary">{t("stats.hourly.title")}</div>
        <div className="ml-auto text-[11px] text-text-secondary">
          {active
            ? t("stats.summary.sessionsMessages", {
                bucket: formatHour(active.hour),
                sessions: formatCount(active.sessions, language),
                messages: formatCount(active.messages, language),
              })
            : t("stats.hourly.empty")}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto ui-thin-scroll">
        {normalized.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-text-muted">
            {t("stats.hourly.noData")}
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className="relative rounded border border-border bg-bg-primary"
              onMouseLeave={() => setActiveHour(null)}
            >
              <svg
                width="100%"
                height={chart.height}
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={t("stats.hourly.chartAria")}
                className="block"
              >
                {[0, 1, 2, 3].map((step) => {
                  const y = chart.paddingTop + (chart.innerHeight * step) / 3;
                  const value = Math.round(((3 - step) * chart.maxValue) / 3);
                  return (
                    <g key={step}>
                      <line
                        x1={chart.paddingLeft}
                        x2={chart.width - chart.paddingRight}
                        y1={y}
                        y2={y}
                        stroke="var(--border)"
                        strokeOpacity="0.45"
                        strokeWidth="1"
                      />
                      <text x={4} y={y - 2} fill="var(--text-muted)" fontSize="9">
                        {value}
                      </text>
                    </g>
                  );
                })}

                {chart.points.map((point) => (
                  <g key={point.item.hour}>
                    <rect
                      x={point.barX}
                      y={point.barY}
                      width={chart.barWidth}
                      height={Math.max(1, point.barHeight)}
                      rx={2}
                      fill={BAR_COLOR}
                      fillOpacity={activeHour === point.item.hour ? 1 : 0.86}
                    />
                    {point.item.hour % 3 === 0 && (
                      <text
                        x={point.center}
                        y={chart.height - 8}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                        fontSize="9"
                      >
                        {point.item.hour}
                      </text>
                    )}
                    <rect
                      x={point.slotX}
                      y={chart.paddingTop}
                      width={chart.slotWidth}
                      height={chart.innerHeight}
                      fill="transparent"
                      tabIndex={0}
                      style={{ outline: "none" }}
                      onMouseEnter={() => setActiveHour(point.item.hour)}
                      onFocus={() => setActiveHour(point.item.hour)}
                      onBlur={() => setActiveHour(null)}
                      aria-label={t("stats.summary.sessionsMessages", {
                        bucket: formatHour(point.item.hour),
                        sessions: formatCount(point.item.sessions, language),
                        messages: formatCount(point.item.messages, language),
                      })}
                      data-hour-index={point.index}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const nextIndex =
                          event.key === "ArrowRight"
                            ? Math.min(chart.points.length - 1, point.index + 1)
                            : Math.max(0, point.index - 1);
                        const root = event.currentTarget.ownerSVGElement;
                        const next = root?.querySelector<SVGRectElement>(
                          `rect[data-hour-index='${nextIndex}']`
                        );
                        next?.focus();
                      }}
                    />
                  </g>
                ))}
              </svg>

              {tooltipPoint && (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-bg-secondary px-2.5 py-1.5 text-[11px] shadow-lg"
                  style={{
                    left: `${(tooltipPoint.center / chart.width) * 100}%`,
                    top: 6,
                  }}
                >
                  <div className="font-semibold text-text-primary">{formatHour(tooltipPoint.item.hour)}</div>
                  <div className="mt-0.5 text-text-secondary">{t("stats.unit.sessions", { count: formatCount(tooltipPoint.item.sessions, language) })}</div>
                  <div className="text-text-secondary">{t("stats.unit.messages", { count: formatCount(tooltipPoint.item.messages, language) })}</div>
                </div>
              )}
            </div>

            <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BAR_COLOR }} />
                {t("stats.hourly.legendMessages")}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

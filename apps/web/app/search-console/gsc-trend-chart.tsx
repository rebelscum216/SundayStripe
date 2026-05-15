"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type TrendPoint = { date: string; clicks: number; impressions: number };
type WindowOption = 7 | 28 | 90;

function fmtYAxis(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function fmtDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function fmtFull(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

const CHART_HEIGHT = 160;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 16;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 36;

export function GscTrendChart({
  initialDays,
  initialData,
}: {
  initialDays: WindowOption;
  initialData: TrendPoint[];
}) {
  const [selectedDays, setSelectedDays] = useState<WindowOption>(initialDays);
  const [data, setData] = useState<TrendPoint[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: TrendPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const fetchData = useCallback(async (days: WindowOption) => {
    setLoading(true);
    try {
      const res = await fetch(`/api-proxy/search-console/trend?days=${days}`);
      if (res.ok) {
        const json = (await res.json()) as TrendPoint[];
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWindowChange = (days: WindowOption) => {
    setSelectedDays(days);
    void fetchData(days);
  };

  const innerW = Math.max(width - PADDING_LEFT - PADDING_RIGHT, 1);
  const innerH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxImpressions = data.length > 0 ? Math.max(...data.map((d) => d.impressions), 1) : 1;
  const maxClicks = data.length > 0 ? Math.max(...data.map((d) => d.clicks), 1) : 1;
  const yMax = Math.max(maxImpressions, maxClicks);

  // Nice round ceiling for Y axis
  const magnitude = Math.pow(10, Math.floor(Math.log10(yMax)));
  const niceMax = Math.ceil(yMax / magnitude) * magnitude;

  const toX = (i: number) =>
    data.length <= 1 ? PADDING_LEFT + innerW / 2 : PADDING_LEFT + (i / (data.length - 1)) * innerW;
  const toY = (val: number) =>
    PADDING_TOP + innerH - (val / niceMax) * innerH;

  const buildPath = (getter: (d: TrendPoint) => number): string => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(getter(d)).toFixed(1)}`)
      .join(" ");
  };

  const impressionsPath = buildPath((d) => d.impressions);
  const clicksPath = buildPath((d) => d.clicks);

  // X-axis labels: ~6 evenly spaced
  const xLabelCount = Math.min(6, data.length);
  const xLabelIndices = data.length <= 1
    ? [0]
    : Array.from({ length: xLabelCount }, (_, i) =>
        Math.round((i / (xLabelCount - 1)) * (data.length - 1))
      );

  // Y-axis labels: 4 steps
  const ySteps = [0, 0.25, 0.5, 0.75, 1.0];

  // Mouse move handler for tooltip
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    // Find nearest data point
    const relX = mouseX - PADDING_LEFT;
    const frac = relX / innerW;
    const idx = Math.round(Math.max(0, Math.min(frac, 1)) * (data.length - 1));
    const point = data[idx];
    if (!point) return;
    setTooltip({ x: toX(idx), y: (PADDING_TOP + innerH / 2), point });
  };

  const handleMouseLeave = () => setTooltip(null);

  return (
    <div
      style={{ padding: "16px 16px 12px", fontFamily: "var(--ss-font-mono, monospace)" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{
            fontFamily: "var(--ss-font-display, sans-serif)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ss-ink)",
            letterSpacing: "-0.01em",
          }}>
            Clicks &amp; Impressions Trend
          </span>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ss-ink-3)" }}>
              <svg width="18" height="3" viewBox="0 0 18 3" style={{ flexShrink: 0 }}>
                <line x1="0" y1="1.5" x2="18" y2="1.5" stroke="var(--ss-ink-4)" strokeWidth="2" />
              </svg>
              Impressions
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ss-ink-3)" }}>
              <svg width="18" height="3" viewBox="0 0 18 3" style={{ flexShrink: 0 }}>
                <line x1="0" y1="1.5" x2="18" y2="1.5" stroke="var(--ss-orange)" strokeWidth="2" />
              </svg>
              Clicks
            </span>
          </div>
        </div>

        {/* Window selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {([7, 28, 90] as WindowOption[]).map((d) => (
            <button
              key={d}
              onClick={() => handleWindowChange(d)}
              disabled={loading}
              style={{
                padding: "3px 9px",
                fontSize: 11,
                fontFamily: "var(--ss-font-mono, monospace)",
                fontWeight: selectedDays === d ? 600 : 400,
                background: selectedDays === d ? "var(--ss-orange-soft, #fff3ea)" : "transparent",
                border: `1px solid ${selectedDays === d ? "var(--ss-orange, #f97316)" : "var(--ss-line, #e5e5e5)"}`,
                borderRadius: 5,
                color: selectedDays === d ? "var(--ss-orange, #f97316)" : "var(--ss-ink-3)",
                cursor: loading ? "wait" : "pointer",
                transition: "all 0.1s",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ position: "relative", opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
        {data.length === 0 ? (
          <div style={{
            height: CHART_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "var(--ss-ink-4)",
            background: "var(--ss-bg-elev, #f9f9f9)",
            borderRadius: 6,
            border: "1px solid var(--ss-line)",
          }}>
            No daily data yet — run a GSC sync to populate the chart.
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={CHART_HEIGHT}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
          >
            {/* Y-axis gridlines and labels */}
            {ySteps.map((frac) => {
              const yVal = Math.round(niceMax * frac);
              const y = toY(yVal);
              return (
                <g key={frac}>
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={PADDING_LEFT + innerW}
                    y2={y}
                    stroke="var(--ss-line, #e5e5e5)"
                    strokeWidth="1"
                    strokeDasharray={frac === 0 ? "none" : "3,3"}
                  />
                  <text
                    x={PADDING_LEFT - 6}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--ss-ink-4)"
                    fontFamily="var(--ss-font-mono, monospace)"
                  >
                    {fmtYAxis(yVal)}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {xLabelIndices.map((idx) => {
              const d = data[idx];
              if (!d) return null;
              return (
                <text
                  key={idx}
                  x={toX(idx)}
                  y={PADDING_TOP + innerH + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--ss-ink-4)"
                  fontFamily="var(--ss-font-mono, monospace)"
                >
                  {fmtDate(d.date)}
                </text>
              );
            })}

            {/* Impressions line */}
            <path
              d={impressionsPath}
              fill="none"
              stroke="var(--ss-ink-4)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Clicks line */}
            <path
              d={clicksPath}
              fill="none"
              stroke="var(--ss-orange)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Tooltip vertical line */}
            {tooltip && (
              <>
                <line
                  x1={tooltip.x}
                  y1={PADDING_TOP}
                  x2={tooltip.x}
                  y2={PADDING_TOP + innerH}
                  stroke="var(--ss-line)"
                  strokeWidth="1"
                  strokeDasharray="3,2"
                />
                {/* Tooltip box */}
                {(() => {
                  const boxW = 148;
                  const boxH = 62;
                  const boxX = tooltip.x + 10 + boxW > width ? tooltip.x - boxW - 10 : tooltip.x + 10;
                  const boxY = Math.max(PADDING_TOP, Math.min(tooltip.y - boxH / 2, PADDING_TOP + innerH - boxH));
                  return (
                    <g>
                      <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        rx={5}
                        fill="var(--ss-bg-card, #fff)"
                        stroke="var(--ss-line)"
                        strokeWidth="1"
                        style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.08))" }}
                      />
                      <text x={boxX + 10} y={boxY + 16} fontSize={10} fill="var(--ss-ink-3)" fontFamily="var(--ss-font-mono, monospace)">
                        {fmtFull(tooltip.point.date)}
                      </text>
                      <text x={boxX + 10} y={boxY + 33} fontSize={11} fill="var(--ss-orange)" fontWeight="600" fontFamily="var(--ss-font-mono, monospace)">
                        {tooltip.point.clicks.toLocaleString()} clicks
                      </text>
                      <text x={boxX + 10} y={boxY + 50} fontSize={11} fill="var(--ss-ink-3)" fontFamily="var(--ss-font-mono, monospace)">
                        {tooltip.point.impressions.toLocaleString()} impr.
                      </text>
                    </g>
                  );
                })()}
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

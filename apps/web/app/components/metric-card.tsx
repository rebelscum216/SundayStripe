type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  accent?: "good" | "warn" | "bad" | "default";
};

const accentStyles = {
  good: { borderColor: "var(--ss-sage-soft)", background: "color-mix(in oklab, var(--ss-sage-soft) 35%, var(--ss-bg-card))" },
  warn: { borderColor: "var(--ss-amber-soft)", background: "color-mix(in oklab, var(--ss-amber-soft) 38%, var(--ss-bg-card))" },
  bad: { borderColor: "var(--ss-red-soft)", background: "color-mix(in oklab, var(--ss-red-soft) 38%, var(--ss-bg-card))" },
  default: {},
};

const trendMeta = {
  up: { arrow: "↑", color: "var(--ss-sage-ink)" },
  down: { arrow: "↓", color: "var(--ss-red-ink)" },
  flat: { arrow: "→", color: "var(--ss-ink-3)" },
};

export function MetricCard({
  label,
  value,
  sub,
  trend,
  accent = "default",
}: MetricCardProps) {
  const trendInfo = trend ? trendMeta[trend] : null;

  return (
    <div className="ss-card" style={{ padding: "12px 16px", ...accentStyles[accent] }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>
        {label}
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="ss-num" style={{ fontFamily: "var(--ss-font-display)", fontSize: 28, fontWeight: 600, color: "var(--ss-ink)" }}>
          {value}
        </div>
        {trendInfo && (
          <span className="ss-num" style={{ fontSize: 18, fontWeight: 600, color: trendInfo.color }}>
            {trendInfo.arrow}
          </span>
        )}
      </div>
      {sub && <div style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>{sub}</div>}
    </div>
  );
}

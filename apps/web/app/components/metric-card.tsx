type MetricCardProps = {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  accent?: "good" | "warn" | "bad" | "default";
};

const accentClasses = {
  good: "border-emerald-500/60 bg-emerald-950/40",
  warn: "border-amber-500/60 bg-amber-950/40",
  bad: "border-red-500/60 bg-red-950/40",
  default: "border-zinc-800 bg-zinc-900",
};

const trendMeta = {
  up: { arrow: "↑", className: "text-emerald-400" },
  down: { arrow: "↓", className: "text-red-400" },
  flat: { arrow: "→", className: "text-zinc-400" },
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
    <div className={`border px-4 py-3 ${accentClasses[accent]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="font-mono text-3xl font-semibold text-zinc-100">
          {value}
        </div>
        {trendInfo && (
          <span className={`font-mono text-lg font-semibold ${trendInfo.className}`}>
            {trendInfo.arrow}
          </span>
        )}
      </div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

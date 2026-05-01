export function QualityScoreBadge({ score }: { score: number }) {
  const colorClass =
    score >= 80 ? "border-emerald-500 bg-emerald-950 text-emerald-400"
    : score >= 50 ? "border-amber-500 bg-amber-950 text-amber-400"
    : "border-red-500 bg-red-950 text-red-400";
  return (
    <span className={`border px-2 py-0.5 font-mono text-xs font-medium ${colorClass}`} title="Amazon listing quality score (0-100)">
      {score}/100
    </span>
  );
}

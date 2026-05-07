export function QualityScoreBadge({ score }: { score: number }) {
  const colorClass = score >= 80 ? "ss-pill-sage" : score >= 50 ? "ss-pill-amber" : "ss-pill-red";

  return (
    <span className={`ss-pill ss-num ${colorClass}`} title="Amazon listing quality score (0-100)">
      {score}/100
    </span>
  );
}

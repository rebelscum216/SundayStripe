"use client";

type FlagFilter = "all" | "no_revenue" | "opportunity" | "no_listing" | "ok";

type FlagCounts = Record<FlagFilter, number>;

const flagLabels: Record<FlagFilter, string> = {
  all: "All",
  no_revenue: "Traffic Not Converting",
  opportunity: "Expand to Amazon",
  no_listing: "Missing Merchant",
  ok: "OK",
};

export function FlagChips({
  counts,
  onFilter,
}: {
  counts: FlagCounts & { active: FlagFilter };
  onFilter: (filter: FlagFilter) => void;
}) {
  const flags: FlagFilter[] = ["all", "no_revenue", "opportunity", "no_listing", "ok"];

  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <button
          key={flag}
          type="button"
          onClick={() => onFilter(flag)}
          className="ss-btn ss-btn-sm"
          style={counts.active === flag ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
          aria-pressed={counts.active === flag}
        >
          {flagLabels[flag]}
          <span className="ss-num" style={{ marginLeft: 8, color: counts.active === flag ? "var(--ss-orange-ink)" : "var(--ss-ink-3)" }}>{counts[flag]}</span>
        </button>
      ))}
    </div>
  );
}

export type { FlagFilter, FlagCounts };

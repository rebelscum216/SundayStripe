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
          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 aria-pressed:border-blue-500 aria-pressed:bg-blue-950 aria-pressed:text-blue-300"
          aria-pressed={counts.active === flag}
        >
          {flagLabels[flag]}
          <span className="ml-2 font-mono text-zinc-500">{counts[flag]}</span>
        </button>
      ))}
    </div>
  );
}

export type { FlagFilter, FlagCounts };

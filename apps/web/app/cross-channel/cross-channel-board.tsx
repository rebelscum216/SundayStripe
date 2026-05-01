"use client";

import { useMemo, useState } from "react";
import { CrossChannelTable } from "./cross-channel-table";
import { FlagChips, type FlagCounts, type FlagFilter } from "./flag-chips";

type CrossChannelRow = {
  productId: string;
  title: string | null;
  canonicalSku: string;
  revenueCents: number;
  unitsSold: number;
  gscImpressions: number;
  gscClicks: number;
  gscPosition: number | null;
  channels: string[];
  amazonQualityScore: number | null;
  flag: "no_revenue" | "opportunity" | "no_listing" | "ok";
};

type CountsWithActive = FlagCounts & { active: FlagFilter };

export function CrossChannelBoard({
  rows,
  counts,
}: {
  rows: CrossChannelRow[];
  counts: FlagCounts;
}) {
  const [filter, setFilter] = useState<FlagFilter>("all");
  const visibleRows = useMemo(
    () => rows.filter((row) => filter === "all" || row.flag === filter),
    [rows, filter],
  );
  const countsWithActive: CountsWithActive = { ...counts, active: filter };

  return (
    <div className="flex flex-col gap-4">
      <FlagChips counts={countsWithActive} onFilter={setFilter} />
      <CrossChannelTable rows={visibleRows} />
    </div>
  );
}

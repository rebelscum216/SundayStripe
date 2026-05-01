"use client";

import { Fragment, useState } from "react";

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

type Explanation = {
  summary: string;
  likelyCause: string;
  nextBestAction: string;
  expectedUpside: string;
  fixes: Array<{ action: string; channel: string; reason: string }>;
};

type RowExpansion =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: Explanation }
  | { status: "error"; message: string };

const FLAG_META = {
  no_revenue: { label: "Not converting", badge: "border-red-500 bg-red-950 text-red-400", row: "" },
  opportunity: { label: "Expand to Amazon", badge: "border-amber-500 bg-amber-950 text-amber-400", row: "" },
  no_listing: { label: "Missing Merchant", badge: "border-blue-500 bg-blue-950 text-blue-400", row: "" },
  ok: { label: "OK", badge: "border-zinc-700 bg-zinc-900 text-zinc-400", row: "" },
} as const;

const FLAG_ORDER: Record<string, number> = { no_revenue: 0, opportunity: 1, no_listing: 2, ok: 3 };

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  search_console: "GSC",
  amazon_sp: "Amazon",
};

function fmt(cents: number) {
  if (cents === 0) return "-";
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtN(n: number) {
  if (n === 0) return "-";
  return new Intl.NumberFormat("en").format(n);
}

function QualityDot({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="font-mono text-xs">{score}</span>
    </span>
  );
}

function ExpandedRow({ productId }: { productId: string }) {
  const [state, setState] = useState<RowExpansion>({ status: "idle" });

  if (state.status === "idle") {
    void (async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api-proxy/ai/cross-channel-opportunity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        if (!res.ok) {
          setState({ status: "error", message: `${res.status} ${res.statusText}` });
          return;
        }
        const data = (await res.json()) as Explanation;
        setState({ status: "done", data });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }

  if (state.status === "loading") {
    return (
      <div className="px-4 py-3 text-xs text-zinc-400">Analyzing opportunity...</div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="px-4 py-3 text-xs text-red-400">Error: {state.message}</div>
    );
  }

  if (state.status === "done") {
    const { data } = state;
    return (
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-zinc-300">{data.summary}</p>
          <p className="text-xs text-zinc-400"><span className="font-semibold text-zinc-200">Likely cause:</span> {data.likelyCause}</p>
          <p className="text-xs text-zinc-400"><span className="font-semibold text-zinc-200">Next action:</span> {data.nextBestAction}</p>
          <p className="text-xs text-zinc-400"><span className="font-semibold text-zinc-200">Expected upside:</span> {data.expectedUpside}</p>
        </div>
        {data.fixes.length > 0 && (
          <ol className="space-y-1.5">
            {data.fixes.map((fix, i) => (
              <li key={i} className="text-xs text-zinc-400">
                <span className="font-mono text-zinc-500">{i + 1}.</span>{" "}
                <span className="font-medium text-zinc-200">{fix.channel}:</span>{" "}
                {fix.action}
                <span className="text-zinc-500"> - {fix.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return null;
}

type SortKey = "flag" | "revenue" | "gsc";
type FilterFlag = "all" | "no_revenue" | "opportunity" | "no_listing";
type FilterChannel = "all" | "shopify" | "merchant" | "amazon_sp";

export function CrossChannelTable({ rows }: { rows: CrossChannelRow[] }) {
  const [filterFlag, setFilterFlag] = useState<FilterFlag>("all");
  const [filterChannel, setFilterChannel] = useState<FilterChannel>("all");
  const [sort, setSort] = useState<SortKey>("flag");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = rows
    .filter((r) => filterFlag === "all" || r.flag === filterFlag)
    .filter((r) => filterChannel === "all" || r.channels.includes(filterChannel))
    .sort((a, b) => {
      if (sort === "revenue") return b.revenueCents - a.revenueCents;
      if (sort === "gsc") return b.gscImpressions - a.gscImpressions;
      // flag: sort by priority then revenue
      const flagDiff = (FLAG_ORDER[a.flag] ?? 99) - (FLAG_ORDER[b.flag] ?? 99);
      return flagDiff !== 0 ? flagDiff : b.revenueCents - a.revenueCents;
    });

  const flagCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.flag] = (acc[r.flag] ?? 0) + 1;
    return acc;
  }, {});

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const filterBtnBase = "border px-3 py-1 text-xs font-medium transition-colors";
  const filterBtnActive = "border-blue-500 bg-blue-950 text-blue-300";
  const filterBtnIdle = "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-zinc-400 mr-1">Flag</span>
          {(["all", "no_revenue", "opportunity", "no_listing"] as FilterFlag[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterFlag(f)}
              className={`${filterBtnBase} ${filterFlag === f ? filterBtnActive : filterBtnIdle}`}
            >
              {f === "all" ? `All (${rows.length})` : `${FLAG_META[f].label} (${flagCounts[f] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-zinc-400 mr-1">Channel</span>
          {(["all", "shopify", "merchant", "amazon_sp"] as FilterChannel[]).map((c) => (
            <button
              key={c}
              onClick={() => setFilterChannel(c)}
              className={`${filterBtnBase} ${filterChannel === c ? filterBtnActive : filterBtnIdle}`}
            >
              {c === "all" ? "All" : (PLATFORM_LABELS[c] ?? c)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs font-medium text-zinc-400 mr-1">Sort</span>
          {([["flag", "Priority"], ["revenue", "Revenue"], ["gsc", "GSC"]] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`${filterBtnBase} ${sort === key ? filterBtnActive : filterBtnIdle}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-400">No products match the current filters.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">GSC</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">AQ</th>
                <th className="w-8 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const meta = FLAG_META[row.flag] ?? FLAG_META.ok;
                const isExpanded = expandedId === row.productId;
                return (
                  <Fragment key={row.productId}>
                    <tr
                      onClick={() => toggleExpand(row.productId)}
                      className={`cursor-pointer border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40 ${meta.row} ${isExpanded ? "bg-zinc-800" : ""}`}
                    >
                      <td className="max-w-[220px] px-4 py-3">
                        <a
                          href={`/products/${row.productId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium hover:underline"
                        >
                          {row.title ?? row.canonicalSku}
                        </a>
                        <span className="font-mono text-xs text-zinc-500">{row.canonicalSku}</span>
                      </td>

                      <td className="px-4 py-3">
                        {row.flag !== "ok" && (
                          <span className={`border px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                            {meta.label}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm text-zinc-300">{fmt(row.revenueCents)}</span>
                        {row.unitsSold > 0 && (
                          <span className="block font-mono text-xs text-zinc-400">{fmtN(row.unitsSold)} units</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm text-zinc-300">{fmtN(row.gscImpressions)}</span>
                        {row.gscPosition != null && (
                          <span className="block font-mono text-xs text-zinc-400">pos {row.gscPosition.toFixed(1)}</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.channels.length > 0
                            ? row.channels.map((ch) => (
                                <span key={ch} className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">
                                  {PLATFORM_LABELS[ch] ?? ch}
                                </span>
                              ))
                            : <span className="text-xs text-zinc-400">None</span>}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {row.channels.includes("amazon_sp") && row.amazonQualityScore !== null
                          ? <QualityDot score={row.amazonQualityScore} />
                          : <span className="text-zinc-500">-</span>}
                      </td>

                      <td className="px-4 py-3 text-zinc-400">
                        <span className={`transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>›</span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className={`border-b border-zinc-800/60 bg-zinc-950/40 ${meta.row}`}>
                        <td colSpan={7} className="border-t border-zinc-800">
                          <ExpandedRow productId={row.productId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-zinc-400 text-right">{filtered.length} of {rows.length} products</p>
    </div>
  );
}

"use client";

import { Fragment, useEffect, useState } from "react";
import { explainCrossChannelOpportunity, type CrossChannelOpportunityExplanation } from "../actions";

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

type RowExpansion =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: CrossChannelOpportunityExplanation }
  | { status: "error"; message: string };

const FLAG_META = {
  no_revenue: { label: "Not converting", badge: "ss-pill-red", row: "" },
  opportunity: { label: "Expand to Amazon", badge: "ss-pill-amber", row: "" },
  no_listing: { label: "Missing Merchant", badge: "ss-pill-orange", row: "" },
  ok: { label: "OK", badge: "", row: "" },
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
  const color = score >= 70 ? "var(--ss-sage-ink)" : score >= 40 ? "var(--ss-amber-ink)" : "var(--ss-red-ink)";
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color }} />
      <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>{score}</span>
    </span>
  );
}

function ExpandedRow({ productId }: { productId: string }) {
  const [state, setState] = useState<RowExpansion>({ status: "idle" });

  useEffect(() => {
    if (state.status !== "idle") return;
    void (async () => {
      setState({ status: "loading" });
      try {
        const data = await explainCrossChannelOpportunity(productId);
        setState({ status: "done", data });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }, [productId, state.status]);

  if (state.status === "loading") {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--ss-ink-3)" }}>Analyzing opportunity...</div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--ss-red-ink)" }}>Error: {state.message}</div>
    );
  }

  if (state.status === "done") {
    const { data } = state;
    return (
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p style={{ fontSize: 14, color: "var(--ss-ink-2)" }}>{data.summary}</p>
          <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Likely cause:</span> {data.likelyCause}</p>
          <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Next action:</span> {data.nextBestAction}</p>
          <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Expected upside:</span> {data.expectedUpside}</p>
        </div>
        {data.fixes.length > 0 && (
          <ol className="space-y-1.5">
            {data.fixes.map((fix, i) => (
              <li key={i} style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                <span className="ss-num" style={{ color: "var(--ss-ink-4)" }}>{i + 1}.</span>{" "}
                <span style={{ fontWeight: 500, color: "var(--ss-ink)" }}>{fix.channel}:</span>{" "}
                {fix.action}
                <span style={{ color: "var(--ss-ink-4)" }}> - {fix.reason}</span>
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

  const filterBtnBase = "ss-btn ss-btn-sm";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span style={{ marginRight: 4, fontSize: 12, fontWeight: 500, color: "var(--ss-ink-3)" }}>Flag</span>
          {(["all", "no_revenue", "opportunity", "no_listing"] as FilterFlag[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterFlag(f)}
              className={filterBtnBase}
              style={filterFlag === f ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
            >
              {f === "all" ? `All (${rows.length})` : `${FLAG_META[f].label} (${flagCounts[f] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span style={{ marginRight: 4, fontSize: 12, fontWeight: 500, color: "var(--ss-ink-3)" }}>Channel</span>
          {(["all", "shopify", "merchant", "amazon_sp"] as FilterChannel[]).map((c) => (
            <button
              key={c}
              onClick={() => setFilterChannel(c)}
              className={filterBtnBase}
              style={filterChannel === c ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
            >
              {c === "all" ? "All" : (PLATFORM_LABELS[c] ?? c)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <span style={{ marginRight: 4, fontSize: 12, fontWeight: 500, color: "var(--ss-ink-3)" }}>Sort</span>
          {([["flag", "Priority"], ["revenue", "Revenue"], ["gsc", "GSC"]] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={filterBtnBase}
              style={sort === key ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="ss-card" style={{ overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--ss-ink-3)" }}>No products match the current filters.</p>
        ) : (
          <table className="ss-tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Flag</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>GSC</th>
                <th>Channels</th>
                <th>AQ</th>
                <th style={{ width: 32 }} />
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
                      className="cursor-pointer"
                      style={isExpanded ? { background: "var(--ss-bg-elev)" } : undefined}
                    >
                      <td className="max-w-[220px]">
                        <a
                          href={`/products/${row.productId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate"
                          style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}
                        >
                          {row.title ?? row.canonicalSku}
                        </a>
                        <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{row.canonicalSku}</span>
                      </td>

                      <td>
                        {row.flag !== "ok" && (
                          <span className={`ss-pill ${meta.badge}`}>
                            {meta.label}
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <span className="ss-num" style={{ fontSize: 13, color: "var(--ss-ink-2)" }}>{fmt(row.revenueCents)}</span>
                        {row.unitsSold > 0 && (
                          <span className="ss-num" style={{ display: "block", fontSize: 12, color: "var(--ss-ink-3)" }}>{fmtN(row.unitsSold)} units</span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <span className="ss-num" style={{ fontSize: 13, color: "var(--ss-ink-2)" }}>{fmtN(row.gscImpressions)}</span>
                        {row.gscPosition != null && (
                          <span className="ss-num" style={{ display: "block", fontSize: 12, color: "var(--ss-ink-3)" }}>pos {row.gscPosition.toFixed(1)}</span>
                        )}
                      </td>

                      <td>
                        <div className="flex flex-wrap gap-1">
                          {row.channels.length > 0
                            ? row.channels.map((ch) => (
                                <span key={ch} className="ss-pill">
                                  {PLATFORM_LABELS[ch] ?? ch}
                                </span>
                              ))
                            : <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>None</span>}
                        </div>
                      </td>

                      <td>
                        {row.channels.includes("amazon_sp") && row.amazonQualityScore !== null
                          ? <QualityDot score={row.amazonQualityScore} />
                          : <span style={{ color: "var(--ss-ink-3)" }}>-</span>}
                      </td>

                      <td style={{ color: "var(--ss-ink-3)" }}>
                        <span className={`transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>›</span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr style={{ background: "var(--ss-bg-elev)" }}>
                        <td colSpan={7} style={{ borderTop: "1px solid var(--ss-line)" }}>
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

      <p style={{ fontSize: 12, color: "var(--ss-ink-3)", textAlign: "right" }}>{filtered.length} of {rows.length} products</p>
    </div>
  );
}

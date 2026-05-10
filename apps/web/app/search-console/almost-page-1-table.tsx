"use client";

import { useState } from "react";
import { applyProductSeo, optimizePageSeo, type OptimizePageResult } from "../actions";

export type AlmostPage1Row = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  potentialExtraClicks: number;
  matchedProductId: string | null;
  matchedProductTitle: string | null;
  matchedPageUrl: string | null;
};

type ApplyState = "idle" | "saving" | "saved" | "error";
type RowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: OptimizePageResult; editTitle: string; editDescription: string; applyState: ApplyState; applyError: string }
  | { status: "error"; message: string };

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const fieldStyle = {
  border: "1px solid var(--ss-line-strong)",
  background: "var(--ss-bg-card)",
  color: "var(--ss-ink)",
  borderRadius: 7,
} as const;

function QueryRow({ row }: { row: AlmostPage1Row }) {
  const [state, setState] = useState<RowState>({ status: "idle" });

  const url = row.matchedPageUrl ?? row.query;

  function handleOptimize() {
    void (async () => {
      setState({ status: "loading" });
      try {
        const result = await optimizePageSeo({
          url,
          position: row.position,
          impressions: row.impressions,
          topQueries: [row.query],
        });
        setState({ status: "done", result, editTitle: result.seoTitle, editDescription: result.metaDescription, applyState: "idle", applyError: "" });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }

  function handleApply() {
    if (state.status !== "done") return;
    const productId = state.result.productId ?? row.matchedProductId;
    if (!productId) return;
    const { editTitle, editDescription } = state;
    setState({ ...state, applyState: "saving", applyError: "" });
    void (async () => {
      try {
        await applyProductSeo({
          productId,
          seoTitle: editTitle,
          seoDescription: editDescription,
          recommendationId: state.result.recommendationId,
        });
        setState((prev) => prev.status === "done" ? { ...prev, applyState: "saved" } : prev);
      } catch (err) {
        setState((prev) => prev.status === "done" ? { ...prev, applyState: "error", applyError: err instanceof Error ? err.message : "Unknown error" } : prev);
      }
    })();
  }

  const productId = state.status === "done" ? (state.result.productId ?? row.matchedProductId) : row.matchedProductId;

  return (
    <li style={{ background: "var(--ss-bg-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="ss-num" style={{ fontSize: 14, fontWeight: 500, color: "var(--ss-ink)" }}>&ldquo;{row.query}&rdquo;</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
            <span>pos <span style={{ fontWeight: 600, color: "var(--ss-amber-ink)" }}>{row.position.toFixed(1)}</span></span>
            <span>{fmt(row.impressions)} impr.</span>
            <span>{fmt(row.clicks)} clicks</span>
            <span>{fmtPct(row.ctr)} CTR</span>
            {row.potentialExtraClicks > 0 && (
              <span style={{ fontWeight: 500, color: "var(--ss-sage-ink)" }}>
                +{fmt(row.potentialExtraClicks)} potential clicks at #1
              </span>
            )}
          </div>
          {row.matchedProductTitle && (
            <a
              href={`/products/${row.matchedProductId}`}
              className="mt-0.5 underline underline-offset-2"
              style={{ fontSize: 12, color: "var(--ss-orange)" }}
            >
              {row.matchedProductTitle}
            </a>
          )}
        </div>

        <button
          onClick={handleOptimize}
          disabled={state.status === "loading" || state.status === "done"}
          className={`ss-btn ss-btn-sm shrink-0 ${state.status === "loading" ? "ss-btn-primary cursor-wait" : ""} ${state.status === "done" ? "cursor-default opacity-60" : ""}`}
          style={state.status === "idle" ? { borderColor: "var(--ss-amber)", color: "var(--ss-amber-ink)", background: "var(--ss-bg-card)" } : undefined}
        >
          {state.status === "loading" ? "Optimizing…" : state.status === "done" ? "Done" : "AI Optimize"}
        </button>
      </div>

      {state.status === "done" && (
        <div className="space-y-4 px-4 py-4" style={{ borderTop: "1px solid var(--ss-line)", background: "var(--ss-bg-elev)" }}>
          <div className="flex items-start justify-between gap-2">
            <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--ss-ink-3)" }}>{state.result.reasoning}</p>
            {state.result.cached && (
              <span className="ss-pill shrink-0">cached</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>SEO Title</p>
                <span style={{ fontSize: 12, color: state.editTitle.length > 60 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
                  {state.editTitle.length}/60
                </span>
              </div>
              <input
                type="text"
                value={state.editTitle}
                onChange={(e) => setState({ ...state, editTitle: e.target.value })}
                className="w-full px-3 py-2 text-sm focus:outline-none"
                style={fieldStyle}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>Meta Description</p>
                <span style={{ fontSize: 12, color: state.editDescription.length > 160 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
                  {state.editDescription.length}/160
                </span>
              </div>
              <textarea
                value={state.editDescription}
                onChange={(e) => setState({ ...state, editDescription: e.target.value })}
                rows={3}
                className="w-full resize-none px-3 py-2 text-sm focus:outline-none"
                style={fieldStyle}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {productId ? (
              <button
                onClick={handleApply}
                disabled={state.applyState === "saving" || state.applyState === "saved"}
                className={`ss-btn ss-btn-sm ${state.applyState === "saving" ? "ss-btn-primary cursor-wait" : ""} ${state.applyState === "saved" ? "cursor-default opacity-70" : ""}`}
              >
                {state.applyState === "saving" ? "Saving…" : state.applyState === "saved" ? "✓ Saved to Shopify" : "Apply to Shopify"}
              </button>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>No matching product found — copy fields manually.</p>
            )}
            {state.applyState === "error" && (
              <p style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>{state.applyError}</p>
            )}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="px-4 py-3" style={{ borderTop: "2px solid var(--ss-red)", background: "var(--ss-red-soft)", color: "var(--ss-red-ink)", fontSize: 14, fontWeight: 500 }}>
          Error: {state.message}
        </div>
      )}
    </li>
  );
}

export function AlmostPage1Table({ rows }: { rows: AlmostPage1Row[] }) {
  if (rows.length === 0) return null;

  const totalPotential = rows.reduce((s, r) => s + r.potentialExtraClicks, 0);

  return (
    <section className="ss-card" style={{ overflow: "hidden", borderColor: "var(--ss-amber-soft)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--ss-amber-soft)", background: "color-mix(in oklab, var(--ss-amber-soft) 28%, var(--ss-bg-card))" }}>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ss-amber-ink)" }}>
              Almost Page 1
              <span className="ss-num" style={{ marginLeft: 8, fontSize: 14, fontWeight: 400, color: "var(--ss-amber-ink)" }}>
                {rows.length} {rows.length === 1 ? "query" : "queries"} at position 11–20
              </span>
            </h2>
            <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>
              These queries have proven search demand. Small copy improvements can move them onto page 1.
            </p>
          </div>
          {totalPotential > 0 && (
            <div className="shrink-0 text-right">
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--ss-sage-ink)" }}>+{fmt(totalPotential)}</p>
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>potential clicks/mo at #1</p>
            </div>
          )}
        </div>
      </div>
      <ul style={{ borderTop: "0" }}>
        {rows.map((row, i) => (
          <div key={i} style={{ borderTop: i === 0 ? "0" : "1px solid var(--ss-line)" }}>
            <QueryRow row={row} />
          </div>
        ))}
      </ul>
    </section>
  );
}

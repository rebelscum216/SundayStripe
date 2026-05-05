"use client";

import { useState } from "react";

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

type OptimizeResult = {
  seoTitle: string;
  metaDescription: string;
  reasoning: string;
  productId: string | null;
  productTitle: string | null;
  recommendationId: string | null;
  cached: boolean;
};

type ApplyState = "idle" | "saving" | "saved" | "error";
type RowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: OptimizeResult; editTitle: string; editDescription: string; applyState: ApplyState; applyError: string }
  | { status: "error"; message: string };

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function QueryRow({ row }: { row: AlmostPage1Row }) {
  const [state, setState] = useState<RowState>({ status: "idle" });

  const url = row.matchedPageUrl ?? row.query;

  function handleOptimize() {
    void (async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api-proxy/ai/optimize-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            position: row.position,
            impressions: row.impressions,
            topQueries: [row.query],
          }),
        });
        if (!res.ok) {
          setState({ status: "error", message: await res.text() || res.statusText });
          return;
        }
        const result = (await res.json()) as OptimizeResult;
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
        const res = await fetch(`/api-proxy/products/${productId}/seo`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seoTitle: editTitle, seoDescription: editDescription }),
        });
        if (!res.ok) {
          const errText = await res.text();
          setState((prev) => prev.status === "done" ? { ...prev, applyState: "error", applyError: errText || res.statusText } : prev);
          return;
        }
        if (state.result.recommendationId) {
          void fetch(`/api-proxy/ai/recommendations/${state.result.recommendationId}/accept`, { method: "PATCH" });
        }
        setState((prev) => prev.status === "done" ? { ...prev, applyState: "saved" } : prev);
      } catch (err) {
        setState((prev) => prev.status === "done" ? { ...prev, applyState: "error", applyError: err instanceof Error ? err.message : "Unknown error" } : prev);
      }
    })();
  }

  const productId = state.status === "done" ? (state.result.productId ?? row.matchedProductId) : row.matchedProductId;

  return (
    <li className="border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-sm font-medium text-zinc-100">&ldquo;{row.query}&rdquo;</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>pos <span className="font-semibold text-amber-400">{row.position.toFixed(1)}</span></span>
            <span>{fmt(row.impressions)} impr.</span>
            <span>{fmt(row.clicks)} clicks</span>
            <span>{fmtPct(row.ctr)} CTR</span>
            {row.potentialExtraClicks > 0 && (
              <span className="font-medium text-emerald-400">
                +{fmt(row.potentialExtraClicks)} potential clicks at #1
              </span>
            )}
          </div>
          {row.matchedProductTitle && (
            <a
              href={`/products/${row.matchedProductId}`}
              className="mt-0.5 text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
            >
              {row.matchedProductTitle}
            </a>
          )}
        </div>

        <button
          onClick={handleOptimize}
          disabled={state.status === "loading" || state.status === "done"}
          className={`shrink-0 border px-3 py-1.5 text-xs font-semibold transition-colors ${
            state.status === "loading"
              ? "cursor-wait border-blue-500 bg-blue-600 text-white"
              : state.status === "done"
                ? "cursor-default border-zinc-700 bg-zinc-800 text-zinc-500"
                : "border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          }`}
        >
          {state.status === "loading" ? "Optimizing…" : state.status === "done" ? "Done" : "AI Optimize"}
        </button>
      </div>

      {state.status === "done" && (
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs italic text-zinc-400">{state.result.reasoning}</p>
            {state.result.cached && (
              <span className="shrink-0 border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">cached</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">SEO Title</p>
                <span className={`text-xs ${state.editTitle.length > 60 ? "text-red-400" : "text-zinc-500"}`}>
                  {state.editTitle.length}/60
                </span>
              </div>
              <input
                type="text"
                value={state.editTitle}
                onChange={(e) => setState({ ...state, editTitle: e.target.value })}
                className="w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Meta Description</p>
                <span className={`text-xs ${state.editDescription.length > 160 ? "text-red-400" : "text-zinc-500"}`}>
                  {state.editDescription.length}/160
                </span>
              </div>
              <textarea
                value={state.editDescription}
                onChange={(e) => setState({ ...state, editDescription: e.target.value })}
                rows={3}
                className="w-full resize-none border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {productId ? (
              <button
                onClick={handleApply}
                disabled={state.applyState === "saving" || state.applyState === "saved"}
                className={`border px-4 py-2 text-xs font-semibold transition-colors ${
                  state.applyState === "saving"
                    ? "cursor-wait border-blue-500 bg-blue-600 text-white"
                    : state.applyState === "saved"
                      ? "cursor-default border-emerald-600 bg-emerald-900/40 text-emerald-400"
                      : "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                }`}
              >
                {state.applyState === "saving" ? "Saving…" : state.applyState === "saved" ? "✓ Saved to Shopify" : "Apply to Shopify"}
              </button>
            ) : (
              <p className="text-xs text-zinc-500">No matching product found — copy fields manually.</p>
            )}
            {state.applyState === "error" && (
              <p className="text-xs text-red-400">{state.applyError}</p>
            )}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="border-t-2 border-red-700 bg-red-950/40 px-4 py-3 text-sm font-medium text-red-400">
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
    <section className="overflow-hidden rounded border border-amber-500/30 bg-zinc-900">
      <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-amber-300">
              Almost Page 1
              <span className="ml-2 font-mono text-sm font-normal text-amber-500/80">
                {rows.length} {rows.length === 1 ? "query" : "queries"} at position 11–20
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              These queries have proven search demand. Small copy improvements can move them onto page 1.
            </p>
          </div>
          {totalPotential > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-emerald-400">+{fmt(totalPotential)}</p>
              <p className="text-xs text-zinc-500">potential clicks/mo at #1</p>
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y divide-zinc-800">
        {rows.map((row, i) => (
          <QueryRow key={i} row={row} />
        ))}
      </ul>
    </section>
  );
}

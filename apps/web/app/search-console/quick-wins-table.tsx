"use client";

import { useState } from "react";

type GscRow = {
  query?: string;
  url?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
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

function positionClass(position: number) {
  if (position <= 3) return "text-emerald-700 font-semibold";
  if (position <= 10) return "text-zinc-900";
  if (position <= 20) return "text-amber-700";
  return "text-zinc-400";
}

function OptimizeRow({ row, topQueries }: { row: GscRow; topQueries: string[] }) {
  const [state, setState] = useState<RowState>({ status: "idle" });

  const url = row.url ?? "";
  const slug = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || url;

  function handleOptimize() {
    void (async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api-proxy/ai/optimize-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, position: row.position, impressions: row.impressions, topQueries }),
        });
        if (!res.ok) {
          const text = await res.text();
          setState({ status: "error", message: text || res.statusText });
          return;
        }
        const result = (await res.json()) as OptimizeResult;
        setState({
          status: "done",
          result,
          editTitle: result.seoTitle,
          editDescription: result.metaDescription,
          applyState: "idle",
          applyError: "",
        });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }

  function handleApply() {
    if (state.status !== "done" || !state.result.productId) return;
    const productId = state.result.productId;
    const recommendationId = state.result.recommendationId;
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
          const text = await res.text();
          setState((prev) =>
            prev.status === "done"
              ? { ...prev, applyState: "error", applyError: text || res.statusText }
              : prev,
          );
          return;
        }
        // Mark recommendation accepted (best-effort — don't block on it)
        if (recommendationId) {
          void fetch(`/api-proxy/ai/recommendations/${recommendationId}/accept`, { method: "PATCH" });
        }
        setState((prev) => (prev.status === "done" ? { ...prev, applyState: "saved" } : prev));
      } catch (err) {
        setState((prev) =>
          prev.status === "done"
            ? { ...prev, applyState: "error", applyError: err instanceof Error ? err.message : "Unknown error" }
            : prev,
        );
      }
    })();
  }

  return (
    <li className="border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {state.status === "done" && state.result.productId ? (
            <a
              href={`/products/${state.result.productId}`}
              className="truncate font-mono text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              {state.result.productTitle ?? slug}
            </a>
          ) : (
            <span className="truncate font-mono text-xs text-zinc-700">{slug}</span>
          )}
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{fmt(row.impressions)} impr.</span>
            <span>{fmt(row.clicks)} clicks</span>
            <span>{fmtPct(row.ctr)} CTR</span>
            <span className={positionClass(row.position)}>pos {row.position.toFixed(1)}</span>
          </div>
        </div>

        <button
          onClick={handleOptimize}
          disabled={state.status === "loading" || state.status === "done"}
          className={`shrink-0 border px-3 py-1.5 text-xs font-semibold transition-colors ${
            state.status === "loading"
              ? "cursor-wait border-blue-400 bg-blue-500 text-white"
              : state.status === "done"
                ? "border-zinc-300 bg-zinc-100 text-zinc-400 cursor-default"
                : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
          }`}
        >
          {state.status === "loading" ? "⏳ Optimizing…" : state.status === "done" ? "Done" : "Optimize with AI"}
        </button>
      </div>

      {state.status === "done" && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs italic text-zinc-500">{state.result.reasoning}</p>
            {state.result.cached && (
              <span className="shrink-0 border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">cached</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">SEO Title</p>
                <span className={`text-xs ${state.editTitle.length > 60 ? "text-red-500" : "text-zinc-400"}`}>
                  {state.editTitle.length}/60
                </span>
              </div>
              <input
                type="text"
                value={state.editTitle}
                onChange={(e) => setState({ ...state, editTitle: e.target.value })}
                className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Meta Description</p>
                <span className={`text-xs ${state.editDescription.length > 160 ? "text-red-500" : "text-zinc-400"}`}>
                  {state.editDescription.length}/160
                </span>
              </div>
              <textarea
                value={state.editDescription}
                onChange={(e) => setState({ ...state, editDescription: e.target.value })}
                rows={3}
                className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {state.result.productId ? (
              <button
                onClick={handleApply}
                disabled={state.applyState === "saving" || state.applyState === "saved"}
                className={`border px-4 py-2 text-xs font-semibold transition-colors ${
                  state.applyState === "saving"
                    ? "cursor-wait border-blue-400 bg-blue-500 text-white"
                    : state.applyState === "saved"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800 cursor-default"
                      : "border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-700"
                }`}
              >
                {state.applyState === "saving"
                  ? "Saving…"
                  : state.applyState === "saved"
                    ? "✓ Saved to Shopify"
                    : "Apply to Shopify"}
              </button>
            ) : (
              <p className="text-xs text-zinc-400">No matching product found — copy fields manually.</p>
            )}
            {state.applyState === "error" && (
              <p className="text-xs text-red-700">{state.applyError}</p>
            )}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="border-t-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          Error: {state.message}
        </div>
      )}
    </li>
  );
}

export function QuickWinsTable({ quickWins, topQueries, embedded }: { quickWins: GscRow[]; topQueries: string[]; embedded?: boolean }) {
  if (quickWins.length === 0) return null;

  const list = (
    <ul className={embedded ? "divide-y divide-zinc-800" : "divide-y divide-amber-100"}>
      {quickWins.map((row, i) => (
        <OptimizeRow key={i} row={row} topQueries={topQueries} />
      ))}
    </ul>
  );

  if (embedded) return list;

  return (
    <section className="overflow-hidden border border-amber-200 bg-amber-50">
      <div className="border-b border-amber-200 px-4 py-3">
        <h2 className="text-base font-semibold text-amber-900">
          Quick wins
          <span className="ml-2 font-mono text-sm font-normal text-amber-700">
            {quickWins.length} pages in positions 5–20
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-amber-700">
          AI-generated SEO titles and meta descriptions. Edit and apply directly to Shopify.
        </p>
      </div>
      {list}
    </section>
  );
}

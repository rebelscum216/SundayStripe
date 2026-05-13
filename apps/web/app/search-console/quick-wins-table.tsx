"use client";

import { useState } from "react";
import { applyProductSeo, optimizePageSeo, type OptimizePageResult } from "../actions";

type GscRow = {
  query?: string;
  url?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
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

function positionStyle(position: number) {
  if (position <= 3) return { color: "var(--ss-sage-ink)", fontWeight: 700 };
  if (position <= 10) return { color: "var(--ss-ink)" };
  if (position <= 20) return { color: "var(--ss-amber-ink)" };
  return { color: "var(--ss-ink-3)" };
}

const fieldStyle = {
  border: "1px solid var(--ss-line-strong)",
  background: "var(--ss-bg-card)",
  color: "var(--ss-ink)",
  borderRadius: 7,
} as const;

function OptimizeRow({ row, topQueries }: { row: GscRow; topQueries: string[] }) {
  const [state, setState] = useState<RowState>({ status: "idle" });

  const url = row.url ?? "";
  const slug = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || url;

  function handleOptimize() {
    void (async () => {
      setState({ status: "loading" });
      try {
        const result = await optimizePageSeo({ url, position: row.position, impressions: row.impressions, topQueries });
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
        await applyProductSeo({
          productId,
          seoTitle: editTitle,
          seoDescription: editDescription,
          recommendationId,
        });
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
    <li style={{ background: "var(--ss-bg-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {state.status === "done" && state.result.productId ? (
            <a
              href={`/products/${state.result.productId}`}
              className="truncate underline underline-offset-2"
              style={{ fontFamily: "var(--ss-font-mono)", fontSize: 12, color: "var(--ss-orange)" }}
            >
              {state.result.productTitle ?? slug}
            </a>
          ) : (
            <span className="truncate ss-num" style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>
              {slug === "/" || slug === "" ? "Home page (sundaystripe.com/)" : slug}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
            <span>{fmt(row.impressions)} impr.</span>
            <span>{fmt(row.clicks)} clicks</span>
            <span>{fmtPct(row.ctr)} CTR</span>
            <span style={positionStyle(row.position)}>pos {row.position.toFixed(1)}</span>
          </div>
        </div>

        <button
          onClick={handleOptimize}
          disabled={state.status === "loading" || state.status === "done"}
          className={`ss-btn ss-btn-sm shrink-0 ${state.status === "loading" ? "ss-btn-primary cursor-wait" : ""} ${state.status === "done" ? "cursor-default opacity-60" : ""}`}
          style={state.status === "idle" ? { borderColor: "var(--ss-amber)", color: "var(--ss-amber-ink)", background: "var(--ss-bg-card)" } : undefined}
        >
          {state.status === "loading" ? "Optimizing..." : state.status === "done" ? "Done" : "Optimize with AI"}
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

          <div className="space-y-4">
            {/* SEO Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>SEO Title</p>
                <span style={{ fontSize: 12, color: state.editTitle.length > 60 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
                  {state.editTitle.length}/60
                </span>
              </div>
              {state.result.currentSeoTitle && (
                <div className="mb-1.5 px-3 py-2 rounded" style={{ background: "var(--ss-bg-card)", border: "1px solid var(--ss-line)", fontSize: 12, color: "var(--ss-ink-3)" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 6, color: "var(--ss-ink-4)" }}>Current</span>
                  {state.result.currentSeoTitle}
                </div>
              )}
              <input
                type="text"
                value={state.editTitle}
                onChange={(e) => setState({ ...state, editTitle: e.target.value })}
                className="w-full px-3 py-2 text-sm focus:outline-none"
                style={{ ...fieldStyle, borderColor: "var(--ss-orange-soft)" }}
                placeholder="AI-suggested title"
              />
            </div>

            {/* Meta Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>Meta Description</p>
                <span style={{ fontSize: 12, color: state.editDescription.length > 160 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
                  {state.editDescription.length}/160
                </span>
              </div>
              {state.result.currentSeoDescription && (
                <div className="mb-1.5 px-3 py-2 rounded" style={{ background: "var(--ss-bg-card)", border: "1px solid var(--ss-line)", fontSize: 12, color: "var(--ss-ink-3)", lineHeight: 1.5 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 6, color: "var(--ss-ink-4)" }}>Current</span>
                  {state.result.currentSeoDescription}
                </div>
              )}
              <textarea
                value={state.editDescription}
                onChange={(e) => setState({ ...state, editDescription: e.target.value })}
                rows={3}
                className="w-full resize-none px-3 py-2 text-sm focus:outline-none"
                style={{ ...fieldStyle, borderColor: "var(--ss-orange-soft)" }}
                placeholder="AI-suggested description"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {state.result.productId ? (
              <button
                onClick={handleApply}
                disabled={state.applyState === "saving" || state.applyState === "saved"}
                className={`ss-btn ss-btn-sm ss-btn-primary ${state.applyState === "saving" ? "cursor-wait" : ""} ${state.applyState === "saved" ? "cursor-default opacity-70" : ""}`}
              >
                {state.applyState === "saving"
                  ? "Saving..."
                  : state.applyState === "saved"
                    ? "Saved to Shopify ✓"
                    : "Push to Shopify"}
              </button>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                Home page SEO — update in{" "}
                <a
                  href="https://admin.shopify.com/store/sundaystripe/online_store/preferences"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ss-orange-ink)", textDecoration: "underline" }}
                >
                  Shopify Admin → Online Store → Preferences
                </a>
              </p>
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

export function QuickWinsTable({ quickWins, topQueries, embedded }: { quickWins: GscRow[]; topQueries: string[]; embedded?: boolean }) {
  if (quickWins.length === 0) return null;

  const list = (
    <ul>
      {quickWins.map((row, i) => (
        <div key={i} style={{ borderTop: i === 0 ? "0" : "1px solid var(--ss-line)" }}>
          <OptimizeRow row={row} topQueries={topQueries} />
        </div>
      ))}
    </ul>
  );

  if (embedded) return list;

  return (
    <section className="ss-card" style={{ overflow: "hidden", borderColor: "var(--ss-amber-soft)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--ss-amber-soft)", background: "color-mix(in oklab, var(--ss-amber-soft) 28%, var(--ss-bg-card))" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ss-amber-ink)" }}>
          Quick wins
          <span className="ss-num" style={{ marginLeft: 8, fontSize: 14, fontWeight: 400, color: "var(--ss-amber-ink)" }}>
            {quickWins.length} pages in positions 5–20
          </span>
        </h2>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>
          AI-generated SEO titles and meta descriptions. Edit and apply directly to Shopify.
        </p>
      </div>
      {list}
    </section>
  );
}

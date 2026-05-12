"use client";

import { useEffect, useRef, useState } from "react";
import { applyProductSeo, optimizePageSeo, type OptimizePageResult } from "../../actions";

type ApplyState = "idle" | "saving" | "saved" | "error";

type SeoOpportunityProps = {
  productId: string;
  productTitle: string | null;
  currentSeoTitle: string | null;
  currentSeoDescription: string | null;
  query: string;
  url: string;
  position: number;
  impressions: number;
};

const fieldStyle = {
  border: "1px solid var(--ss-line-strong)",
  background: "var(--ss-bg-card)",
  color: "var(--ss-ink)",
  borderRadius: 7,
} as const;

export function ProductSeoOpportunity({
  productId,
  productTitle,
  currentSeoTitle,
  currentSeoDescription,
  query,
  url,
  position,
  impressions,
}: SeoOpportunityProps) {
  const didLoad = useRef(false);
  const [result, setResult] = useState<OptimizePageResult | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "done" | "error">("loading");
  const [applyState, setApplyState] = useState<ApplyState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;

    void (async () => {
      try {
        const recommendation = await optimizePageSeo({
          url,
          position,
          impressions,
          topQueries: [query],
        });
        setResult(recommendation);
        setSeoTitle(recommendation.seoTitle);
        setSeoDescription(recommendation.metaDescription);
        setLoadState("done");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to generate SEO suggestion.");
        setLoadState("error");
      }
    })();
  }, [impressions, position, query, url]);

  async function apply() {
    if (!result || !seoTitle.trim()) return;
    setApplyState("saving");
    setMessage(null);

    try {
      await applyProductSeo({
        productId,
        seoTitle: seoTitle.trim(),
        seoDescription: seoDescription.trim(),
        recommendationId: result.recommendationId,
      });
      setApplyState("saved");
      setMessage("SEO update pushed to Shopify.");
    } catch (error) {
      setApplyState("error");
      setMessage(error instanceof Error ? error.message : "Unable to apply SEO update.");
    }
  }

  return (
    <div
      className="mb-4"
      style={{
        border: "1px solid var(--ss-amber-soft)",
        borderRadius: 8,
        background: "color-mix(in oklab, var(--ss-amber-soft) 18%, var(--ss-bg-card))",
        padding: 16,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-amber-ink)" }}>
            SEO title opportunity
          </p>
          <h3 style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: "var(--ss-ink)" }}>
            {productTitle ?? "Product page"} for &ldquo;{query}&rdquo;
          </h3>
          <p style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>
            Position {position.toFixed(1)} with {new Intl.NumberFormat("en").format(impressions)} impressions.
          </p>
        </div>
        {result?.cached && <span className="ss-pill">cached</span>}
      </div>

      {(currentSeoTitle || currentSeoDescription) && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--ss-line)", paddingTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>
            Current Shopify SEO
          </p>
          {currentSeoTitle && <p style={{ marginTop: 6, fontSize: 13, color: "var(--ss-ink-2)" }}>{currentSeoTitle}</p>}
          {currentSeoDescription && <p style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>{currentSeoDescription}</p>}
        </div>
      )}

      {loadState === "loading" && (
        <p style={{ marginTop: 14, fontSize: 13, color: "var(--ss-ink-3)" }}>Generating SEO suggestion...</p>
      )}

      {loadState === "done" && result && (
        <div className="mt-4 flex flex-col gap-3">
          <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--ss-ink-3)" }}>{result.reasoning}</p>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink-3)" }}>Suggested SEO Title</label>
            <input
              value={seoTitle}
              onChange={(event) => setSeoTitle(event.target.value)}
              className="h-9 px-3 text-sm"
              style={fieldStyle}
            />
            <span style={{ alignSelf: "flex-end", fontSize: 11, color: seoTitle.length > 60 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
              {seoTitle.length}/60
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink-3)" }}>Suggested Meta Description</label>
            <textarea
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
              rows={3}
              className="resize-none px-3 py-2 text-sm"
              style={fieldStyle}
            />
            <span style={{ alignSelf: "flex-end", fontSize: 11, color: seoDescription.length > 160 ? "var(--ss-red-ink)" : "var(--ss-ink-3)" }}>
              {seoDescription.length}/160
            </span>
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={applyState === "saving" || applyState === "saved" || !seoTitle.trim()}
            className="ss-btn ss-btn-primary self-start disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applyState === "saving" ? "Applying..." : applyState === "saved" ? "Applied to Shopify" : "Apply to Shopify"}
          </button>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 12, fontSize: 12, color: applyState === "error" || loadState === "error" ? "var(--ss-red-ink)" : "var(--ss-sage-ink)" }}>
          {message}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

type OpportunityExplanation = {
  summary: string;
  likelyCause: string;
  nextBestAction: string;
  expectedUpside: string;
  fixes: Array<{ action: string; channel: string; reason: string }>;
};

export function OpportunityExplainer({ productId }: { productId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [explanation, setExplanation] = useState<OpportunityExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    if (state === "done") {
      setState("idle");
      setExplanation(null);
      return;
    }

    setState("loading");
    setError(null);

    try {
      const res = await fetch("/api-proxy/ai/cross-channel-opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as OpportunityExplanation;
      setExplanation(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setState("error");
    }
  }

  return (
    <div className="flex min-w-[260px] flex-col gap-2">
      <button
        type="button"
        onClick={explain}
        disabled={state === "loading"}
        className="ss-btn ss-btn-sm w-fit disabled:opacity-50"
      >
        {state === "loading" ? "Explaining..." : state === "done" ? "Hide" : "Explain"}
      </button>

      {state === "error" && (
        <p style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>Could not explain: {error}</p>
      )}

      {explanation && (
        <div className="ss-card flex flex-col gap-2" style={{ padding: 12 }}>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: "var(--ss-ink-2)" }}>{explanation.summary}</p>
          <div className="grid gap-2" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
            <p><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Cause:</span> {explanation.likelyCause}</p>
            <p><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Next:</span> {explanation.nextBestAction}</p>
            <p><span style={{ fontWeight: 600, color: "var(--ss-ink)" }}>Upside:</span> {explanation.expectedUpside}</p>
          </div>
          {explanation.fixes.length > 0 && (
            <ol className="space-y-1" style={{ borderTop: "1px solid var(--ss-line)", paddingTop: 8 }}>
              {explanation.fixes.map((fix, index) => (
                <li key={`${fix.channel}-${index}`} style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ss-ink-3)" }}>
                  <span className="ss-num" style={{ color: "var(--ss-ink-4)" }}>{index + 1}.</span>{" "}
                  <span style={{ fontWeight: 500, color: "var(--ss-ink)" }}>{fix.channel}:</span>{" "}
                  {fix.action}
                  <span style={{ color: "var(--ss-ink-4)" }}> — {fix.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

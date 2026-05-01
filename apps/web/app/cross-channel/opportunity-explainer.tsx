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
        className="w-fit border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {state === "loading" ? "Explaining..." : state === "done" ? "Hide" : "Explain"}
      </button>

      {state === "error" && (
        <p className="text-xs text-red-600">Could not explain: {error}</p>
      )}

      {explanation && (
        <div className="flex flex-col gap-2 border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm leading-5 text-zinc-800">{explanation.summary}</p>
          <div className="grid gap-2 text-xs text-zinc-600">
            <p><span className="font-semibold text-zinc-800">Cause:</span> {explanation.likelyCause}</p>
            <p><span className="font-semibold text-zinc-800">Next:</span> {explanation.nextBestAction}</p>
            <p><span className="font-semibold text-zinc-800">Upside:</span> {explanation.expectedUpside}</p>
          </div>
          {explanation.fixes.length > 0 && (
            <ol className="space-y-1 border-t border-zinc-200 pt-2">
              {explanation.fixes.map((fix, index) => (
                <li key={`${fix.channel}-${index}`} className="text-xs leading-5 text-zinc-600">
                  <span className="font-mono text-zinc-400">{index + 1}.</span>{" "}
                  <span className="font-medium text-zinc-800">{fix.channel}:</span>{" "}
                  {fix.action}
                  <span className="text-zinc-400"> — {fix.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

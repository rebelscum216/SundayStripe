"use client";

import { useState } from "react";

type TriageGroup = {
  id: string;
  title: string;
  platform: string;
  priority: "critical" | "high" | "medium" | "low";
  alertIds: string[];
  rootCause: string;
  recommendedAction: string;
  estimatedImpact: string;
};

type TriageResult = {
  summary: string;
  groups: TriageGroup[];
  cached: boolean;
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: TriageResult }
  | { status: "error"; message: string };

const PRIORITY_BORDER: Record<string, string> = {
  critical: "border-red-800/60 bg-red-950/30",
  high: "border-orange-800/60 bg-orange-950/20",
  medium: "border-amber-800/40 bg-amber-950/20",
  low: "border-zinc-700 bg-zinc-800/40",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "border-red-500 bg-red-950 text-red-400",
  high: "border-orange-500 bg-orange-950 text-orange-400",
  medium: "border-amber-500 bg-amber-950 text-amber-400",
  low: "border-zinc-600 bg-zinc-800 text-zinc-400",
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant Center",
  amazon_sp: "Amazon",
  search_console: "Search Console",
  mixed: "Multiple",
};

export function TriagePanel({ alertCount }: { alertCount: number }) {
  const [state, setState] = useState<State>({ status: "idle" });

  function handleTriage() {
    void (async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api-proxy/ai/triage-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) {
          const text = await res.text();
          setState({ status: "error", message: text || res.statusText });
          return;
        }
        const result = (await res.json()) as TriageResult;
        setState({ status: "done", result });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">AI Triage</p>
          <p className="text-xs text-zinc-500">Group and prioritize all open alerts by root cause</p>
        </div>
        <button
          onClick={handleTriage}
          disabled={state.status === "loading" || state.status === "done"}
          className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
            state.status === "loading"
              ? "cursor-wait border-blue-600 bg-blue-600 text-white"
              : state.status === "done"
                ? "cursor-default border-zinc-700 bg-zinc-800 text-zinc-500"
                : "border-blue-600 bg-blue-600 text-white hover:bg-blue-500"
          }`}
        >
          {state.status === "loading"
            ? `Analyzing ${alertCount} alerts…`
            : state.status === "done"
              ? "Done"
              : "Run Triage"}
        </button>
      </div>

      {state.status === "done" && (
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm italic text-zinc-400">{state.result.summary}</p>
            {state.result.cached && (
              <span className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                cached
              </span>
            )}
          </div>
          <div className="space-y-2">
            {state.result.groups.map((group) => (
              <div
                key={group.id}
                className={`rounded border p-3 ${PRIORITY_BORDER[group.priority] ?? PRIORITY_BORDER.low}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${PRIORITY_BADGE[group.priority] ?? PRIORITY_BADGE.low}`}
                  >
                    {group.priority}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {PLATFORM_LABELS[group.platform] ?? group.platform}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {group.alertIds.length} alert{group.alertIds.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="font-semibold text-zinc-100">{group.title}</p>
                <p className="mt-1 text-sm text-zinc-400">
                  <span className="font-medium text-zinc-300">Root cause: </span>
                  {group.rootCause}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  <span className="font-medium text-zinc-300">Fix: </span>
                  {group.recommendedAction}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Impact: {group.estimatedImpact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="border-t border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
          Error: {state.message}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { triageAlerts, type AlertTriageResult } from "../actions";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AlertTriageResult }
  | { status: "error"; message: string };

const PRIORITY_STYLE: Record<string, CSSProperties> = {
  critical: { borderColor: "var(--ss-red)", background: "var(--ss-red-soft)" },
  high: { borderColor: "var(--ss-orange)", background: "var(--ss-orange-soft)" },
  medium: { borderColor: "var(--ss-amber)", background: "var(--ss-amber-soft)" },
  low: { borderColor: "var(--ss-line)", background: "var(--ss-bg-elev)" },
};

const PRIORITY_BADGE_STYLE: Record<string, CSSProperties> = {
  critical: { borderColor: "var(--ss-red)", background: "var(--ss-red-soft)", color: "var(--ss-red-ink)" },
  high: { borderColor: "var(--ss-orange)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" },
  medium: { borderColor: "var(--ss-amber)", background: "var(--ss-amber-soft)", color: "var(--ss-amber-ink)" },
  low: { borderColor: "var(--ss-line-strong)", background: "var(--ss-bg-card)", color: "var(--ss-ink-3)" },
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
        const result = await triageAlerts();
        setState({ status: "done", result });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      }
    })();
  }

  return (
    <div className="ss-card">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--ss-line)" }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ss-ink)" }}>AI Triage</p>
          <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Group and prioritize all open alerts by root cause</p>
        </div>
        <button
          onClick={handleTriage}
          disabled={state.status === "loading" || state.status === "done"}
          className={`ss-btn ss-btn-sm ${state.status === "loading" ? "ss-btn-primary cursor-wait" : state.status === "idle" ? "ss-btn-primary" : "cursor-default opacity-60"}`}
        >
          {state.status === "loading"
            ? `Analyzing ${alertCount} alerts...`
            : state.status === "done"
              ? "Done"
              : "Run Triage"}
        </button>
      </div>

      {state.status === "done" && (
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--ss-ink-3)" }}>{state.result.summary}</p>
            {state.result.cached && (
              <span className="ss-pill shrink-0">
                cached
              </span>
            )}
          </div>
          <div className="space-y-2">
            {state.result.groups.map((group) => (
              <div
                key={group.id}
                className="rounded border p-3"
                style={PRIORITY_STYLE[group.priority] ?? PRIORITY_STYLE.low}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className="ss-pill"
                    style={PRIORITY_BADGE_STYLE[group.priority] ?? PRIORITY_BADGE_STYLE.low}
                  >
                    {group.priority}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                    {PLATFORM_LABELS[group.platform] ?? group.platform}
                  </span>
                  <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                    {group.alertIds.length} alert{group.alertIds.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p style={{ fontWeight: 700, color: "var(--ss-ink)" }}>{group.title}</p>
                <p style={{ marginTop: 4, fontSize: 13, color: "var(--ss-ink-3)" }}>
                  <span style={{ fontWeight: 600, color: "var(--ss-ink-2)" }}>Root cause: </span>
                  {group.rootCause}
                </p>
                <p style={{ marginTop: 4, fontSize: 13, color: "var(--ss-ink-3)" }}>
                  <span style={{ fontWeight: 600, color: "var(--ss-ink-2)" }}>Fix: </span>
                  {group.recommendedAction}
                </p>
                <p style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>Impact: {group.estimatedImpact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="px-4 py-3" style={{ borderTop: "2px solid var(--ss-red)", background: "var(--ss-red-soft)", color: "var(--ss-red-ink)", fontSize: 13, fontWeight: 600 }}>
          Error: {state.message}
        </div>
      )}
    </div>
  );
}

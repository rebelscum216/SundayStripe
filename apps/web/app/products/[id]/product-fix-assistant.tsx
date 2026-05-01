"use client";

import { useState } from "react";
import { useDrawer } from "../../components/drawer-context";

type FixPlan = {
  summary: string;
  priority: "high" | "medium" | "low";
  fixes: Array<{
    title: string;
    why: string;
    action: string;
    channel: string;
    impact: string;
  }>;
};

const PRIORITY_BADGE: Record<FixPlan["priority"], string> = {
  high: "border-red-600 bg-red-950 text-red-400",
  medium: "border-amber-600 bg-amber-950 text-amber-400",
  low: "border-zinc-600 bg-zinc-800 text-zinc-400",
};

function FixPlanContent({ plan }: { plan: FixPlan }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="leading-relaxed text-zinc-300">{plan.summary}</p>
        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[plan.priority] ?? PRIORITY_BADGE.low}`}>
          {plan.priority} priority
        </span>
      </div>
      <ol className="flex flex-col gap-3">
        {plan.fixes.map((fix, i) => (
          <li key={`${fix.title}-${i}`} className="flex gap-3 rounded border border-zinc-700 bg-zinc-800 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-600 font-mono text-xs font-semibold text-zinc-400">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold text-zinc-100">{fix.title}</p>
              <p className="text-xs text-zinc-500">{fix.why}</p>
              <p className="text-zinc-300">{fix.action}</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                  {fix.channel}
                </span>
                <span className="rounded border border-emerald-700 bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400">
                  {fix.impact}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ProductFixAssistant({ productId }: { productId: string }) {
  const { open } = useDrawer();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function generate() {
    setState("loading");
    try {
      const res = await fetch("/api-proxy/ai/product-fix-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as FixPlan;
      setState("idle");
      open(<FixPlanContent plan={data} />);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={generate}
        disabled={state === "loading"}
        className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
      >
        {state === "loading" ? "Analyzing…" : "Product Fix Assistant"}
      </button>
      {state === "error" && <span className="text-xs text-red-400">Failed — try again</span>}
    </div>
  );
}

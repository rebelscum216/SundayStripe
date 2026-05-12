"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { useDrawer } from "../../components/drawer-context";
import { generateProductFixPlan, type ProductFixPlan } from "../../actions";

const PRIORITY_STYLE: Record<ProductFixPlan["priority"], CSSProperties> = {
  high: { borderColor: "var(--ss-red)", background: "var(--ss-red-soft)", color: "var(--ss-red-ink)" },
  medium: { borderColor: "var(--ss-amber)", background: "var(--ss-amber-soft)", color: "var(--ss-amber-ink)" },
  low: { borderColor: "var(--ss-line-strong)", background: "var(--ss-bg-elev)", color: "var(--ss-ink-3)" },
};

function FixPlanContent({ plan }: { plan: ProductFixPlan }) {
  return (
    <div className="flex flex-col gap-4" style={{ fontSize: 13, color: "var(--ss-ink)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p style={{ lineHeight: 1.55, color: "var(--ss-ink-2)" }}>{plan.summary}</p>
        <span className="ss-pill" style={PRIORITY_STYLE[plan.priority] ?? PRIORITY_STYLE.low}>
          {plan.priority} priority
        </span>
      </div>
      <ol className="flex flex-col gap-3">
        {plan.fixes.map((fix, i) => (
          <li key={`${fix.title}-${i}`} className="ss-card flex gap-3" style={{ padding: 12 }}>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center ss-num"
              style={{ border: "1px solid var(--ss-line)", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "var(--ss-ink-3)" }}
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1.5">
              <p style={{ fontWeight: 700, color: "var(--ss-ink)" }}>{fix.title}</p>
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{fix.why}</p>
              <p style={{ color: "var(--ss-ink-2)" }}>{fix.action}</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="ss-pill">
                  {fix.channel}
                </span>
                <span className="ss-pill" style={{ borderColor: "var(--ss-sage-soft)", color: "var(--ss-sage-ink)" }}>
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
      const data = await generateProductFixPlan(productId);
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
        className="ss-btn ss-btn-sm"
      >
        {state === "loading" ? "Analyzing..." : "Show fix plan"}
      </button>
      {state === "error" && <span style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>Failed. Try again.</span>}
    </div>
  );
}

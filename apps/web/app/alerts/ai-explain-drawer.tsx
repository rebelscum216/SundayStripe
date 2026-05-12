"use client";

import Link from "next/link";
import { useState } from "react";
import {
  applyAlertAction,
  explainAlert,
  type AlertExplanation,
} from "../actions";
import { useDrawer } from "../components/drawer-context";

function ExplainContent({ alertId, initialResult }: { alertId: string; initialResult: AlertExplanation }) {
  const { close } = useDrawer();
  const [result, setResult] = useState<AlertExplanation>(initialResult);
  const [actionState, setActionState] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function applyAction(actionId: string) {
    setActionState("applying");
    setActionMessage(null);
    try {
      const data = await applyAlertAction({ alertId, actionId });
      setResult((current) => ({ ...current, live: data.live ?? current.live }));
      setActionMessage(data.message ?? "Action applied.");
      setActionState("applied");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Action failed.");
      setActionState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4" style={{ fontSize: 13, color: "var(--ss-ink)" }}>
      <div className="ss-card" style={{ padding: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
          AI Explanation
        </p>
        <p style={{ marginTop: 8, lineHeight: 1.55, color: "var(--ss-ink-2)" }}>
          {result.summary}
        </p>
      </div>

      {result.fixes?.length > 0 && (
        <div>
          <p style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
            Fix Steps
          </p>
          <ol className="flex flex-col gap-1.5 pl-4">
            {result.fixes.map((fix, index) => (
              <li key={index} className="list-decimal leading-snug" style={{ color: "var(--ss-ink-2)" }}>
                {fix}
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.live && (
        <div className="flex flex-col gap-2">
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
            Live Context
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="ss-card" style={{ padding: 12 }}>
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Shopify price</p>
              <p className="ss-num" style={{ marginTop: 4, fontWeight: 700, color: "var(--ss-ink)" }}>
                {result.live.shopifyVariant?.price
                  ? `${result.live.shopifyVariant.currencyCode ?? "USD"} ${result.live.shopifyVariant.price}`
                  : "-"}
              </p>
            </div>
            <div className="ss-card" style={{ padding: 12 }}>
              <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Merchant price</p>
              <p className="ss-num" style={{ marginTop: 4, fontWeight: 700, color: "var(--ss-ink)" }}>
                {result.live.merchantProduct?.price
                  ? `${result.live.merchantProduct.currencyCode ?? "USD"} ${result.live.merchantProduct.price}`
                  : "-"}
              </p>
            </div>
          </div>
          {result.live.priceComparison && (
            <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
              {result.live.priceComparison.message}
            </p>
          )}
        </div>
      )}

      {(result.live?.actions?.length ?? 0) > 0 && (
        <div className="ss-card flex flex-col gap-2" style={{ padding: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
            Agent Actions
          </p>
          {(result.live?.actions ?? []).map((action) => (
            <div key={action.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink)" }}>{action.label}</p>
                <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                  {action.disabled ? action.disabledReason : action.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyAction(action.id)}
                disabled={action.disabled || actionState === "applying"}
                className={`ss-btn ss-btn-sm ${actionState === "applying" ? "ss-btn-primary cursor-wait" : "ss-btn-primary"} disabled:opacity-60`}
              >
                {actionState === "applying" ? "Applying..." : "Apply"}
              </button>
            </div>
          ))}
          {actionMessage && (
            <p style={{ fontSize: 12, color: actionState === "error" ? "var(--ss-red-ink)" : "var(--ss-sage-ink)" }}>
              {actionMessage}
            </p>
          )}
        </div>
      )}

      {result.links?.length > 0 && (
        <div className="flex flex-col gap-2">
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
            Related
          </p>
          {result.links.map((link) => {
            const isExternal = link.href.startsWith("http");
            const className = "ss-card p-3 text-left";
            const content = (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink)" }}>{link.label}</p>
                <p style={{ marginTop: 2, fontSize: 12, lineHeight: 1.5, color: "var(--ss-ink-3)" }}>{link.description}</p>
              </>
            );

            return isExternal ? (
              <a
                key={`${link.href}-${link.label}`}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {content}
              </a>
            ) : (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                onClick={close}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AiExplainDrawerButton({ alertId }: { alertId: string }) {
  const { open } = useDrawer();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function explain() {
    setState("loading");
    try {
      const data = await explainAlert(alertId);
      setState("idle");
      open(<ExplainContent alertId={alertId} initialResult={data} />);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--ss-line)" }}>
      <button
        type="button"
        onClick={explain}
        disabled={state === "loading"}
        className="ss-btn ss-btn-sm disabled:opacity-50"
      >
        {state === "loading" ? "Thinking..." : "Explain with AI"}
      </button>
      {state === "error" && (
        <span className="ml-2" style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>Failed. Try again.</span>
      )}
    </div>
  );
}

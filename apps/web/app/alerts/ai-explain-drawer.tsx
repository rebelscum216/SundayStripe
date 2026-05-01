"use client";

import Link from "next/link";
import { useState } from "react";
import { useDrawer } from "../components/drawer-context";

type FixLink = { label: string; href: string; description: string };
type AlertAction = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};
type LiveContext = {
  product: { title: string | null; sku: string } | null;
  shopifyVariant: {
    price: string | null;
    compareAtPrice: string | null;
    currencyCode: string | null;
    sku: string | null;
    productTitle: string | null;
    error?: string;
  } | null;
  merchantProduct: {
    price: string | null;
    currencyCode: string | null;
    lastUpdateDate: string | null;
    error?: string;
  } | null;
  priceComparison: { status: string; message: string; delta?: string } | null;
  actions: AlertAction[];
};
type AiResult = {
  summary: string;
  fixes: string[];
  links: FixLink[];
  live?: LiveContext | null;
};

function ExplainContent({ alertId, initialResult }: { alertId: string; initialResult: AiResult }) {
  const { close } = useDrawer();
  const [result, setResult] = useState<AiResult>(initialResult);
  const [actionState, setActionState] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function applyAction(actionId: string) {
    setActionState("applying");
    setActionMessage(null);
    try {
      const res = await fetch("/api-proxy/ai/apply-alert-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, actionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { message?: string; live?: LiveContext | null };
      setResult((c) => ({ ...c, live: data.live ?? c.live }));
      setActionMessage(data.message ?? "Action applied.");
      setActionState("applied");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Action failed.");
      setActionState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Summary */}
      <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">AI Explanation</p>
        <p className="mt-2 leading-relaxed text-zinc-200">{result.summary}</p>
      </div>

      {/* Fix steps */}
      {result.fixes?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Fix Steps</p>
          <ol className="flex flex-col gap-1.5 pl-4">
            {result.fixes.map((fix, i) => (
              <li key={i} className="list-decimal leading-snug text-zinc-300">
                {fix}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Live price context */}
      {result.live && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Live Context</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
              <p className="text-xs text-zinc-500">Shopify price</p>
              <p className="mt-1 font-mono font-semibold text-zinc-100">
                {result.live.shopifyVariant?.price
                  ? `${result.live.shopifyVariant.currencyCode ?? "USD"} ${result.live.shopifyVariant.price}`
                  : "—"}
              </p>
            </div>
            <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
              <p className="text-xs text-zinc-500">Merchant price</p>
              <p className="mt-1 font-mono font-semibold text-zinc-100">
                {result.live.merchantProduct?.price
                  ? `${result.live.merchantProduct.currencyCode ?? "USD"} ${result.live.merchantProduct.price}`
                  : "—"}
              </p>
            </div>
          </div>
          {result.live.priceComparison && (
            <p className="text-xs text-zinc-400">{result.live.priceComparison.message}</p>
          )}
        </div>
      )}

      {/* Agent actions */}
      {(result.live?.actions?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 rounded border border-zinc-700 bg-zinc-800 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Agent Actions</p>
          {(result.live?.actions ?? []).map((action) => (
            <div key={action.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-zinc-200">{action.label}</p>
                <p className="text-xs text-zinc-500">
                  {action.disabled ? action.disabledReason : action.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyAction(action.id)}
                disabled={action.disabled || actionState === "applying"}
                className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:border-zinc-700 disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {actionState === "applying" ? "Applying…" : "Apply"}
              </button>
            </div>
          ))}
          {actionMessage && (
            <p className={`text-xs ${actionState === "error" ? "text-red-400" : "text-emerald-400"}`}>
              {actionMessage}
            </p>
          )}
        </div>
      )}

      {/* Links */}
      {result.links?.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Related</p>
          {result.links.map((link) => {
            const isExternal = link.href.startsWith("http");
            const className =
              "rounded border border-zinc-700 bg-zinc-800 p-3 text-left hover:border-zinc-500";

            const content = (
              <>
                <p className="text-xs font-medium text-zinc-200">{link.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{link.description}</p>
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
      const res = await fetch("/api-proxy/ai/explain-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as AiResult;
      setState("idle");
      open(<ExplainContent alertId={alertId} initialResult={data} />);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-2 border-t border-zinc-700/60 pt-2">
      <button
        type="button"
        onClick={explain}
        disabled={state === "loading"}
        className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
      >
        {state === "loading" ? "Thinking…" : "Explain with AI →"}
      </button>
      {state === "error" && (
        <span className="ml-2 text-xs text-red-400">Failed — try again</span>
      )}
    </div>
  );
}

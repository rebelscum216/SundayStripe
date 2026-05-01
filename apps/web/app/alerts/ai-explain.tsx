"use client";

import { useState } from "react";

type FixLink = {
  label: string;
  href: string;
  description: string;
};

type AlertAction = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};

type LiveContext = {
  product: {
    title: string | null;
    sku: string;
  } | null;
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
  priceComparison: {
    status: string;
    message: string;
    delta?: string;
  } | null;
  actions: AlertAction[];
};

type AiResult = { summary: string; fixes: string[]; links: FixLink[]; live?: LiveContext | null };

export function AiExplainButton({ alertId }: { alertId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [actionState, setActionState] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [result, setResult] = useState<AiResult | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function explain() {
    if (state === "done") {
      setState("idle");
      setResult(null);
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api-proxy/ai/explain-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as AiResult;
      setResult(data);
      setState("done");
    } catch {
      setState("error");
    }
  }

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
      setResult((current) => current ? { ...current, live: data.live ?? current.live } : current);
      setActionMessage(data.message ?? "Action applied.");
      setActionState("applied");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Action failed.");
      setActionState("error");
    }
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <button
        type="button"
        onClick={explain}
        disabled={state === "loading"}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
      >
        {state === "loading" ? "Thinking…" : state === "done" ? "Hide explanation" : "What does this mean? →"}
      </button>

      {state === "error" && (
        <p className="mt-1 text-xs text-red-600">Failed to load explanation.</p>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-medium text-zinc-900">AI explanation</p>
            <p className="mt-1 text-sm text-zinc-700">{result.summary}</p>
          </div>

          {result.fixes?.length > 0 && (
            <ol className="flex flex-col gap-1 pl-4">
              {result.fixes.map((fix, i) => (
                <li key={i} className="list-decimal text-sm text-zinc-600">
                  {fix}
                </li>
              ))}
            </ol>
          )}

          {result.live && (
            <div className="grid gap-2 md:grid-cols-3">
              <div className="border border-zinc-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Affected variant</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {result.live.product?.title ?? result.live.shopifyVariant?.productTitle ?? "Unknown product"}
                </p>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {result.live.product?.sku ?? result.live.shopifyVariant?.sku ?? "No SKU"}
                </p>
              </div>

              <div className="border border-zinc-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Shopify live price</p>
                <p className="mt-1 font-mono text-lg font-semibold text-zinc-900">
                  {result.live.shopifyVariant
                    ? result.live.shopifyVariant.price
                      ? `${result.live.shopifyVariant.currencyCode ?? "USD"} ${result.live.shopifyVariant.price}`
                      : "Unavailable"
                    : "Unavailable"}
                </p>
                {result.live.shopifyVariant?.compareAtPrice && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Compare at {result.live.shopifyVariant.currencyCode ?? "USD"} {result.live.shopifyVariant.compareAtPrice}
                  </p>
                )}
                {result.live.shopifyVariant?.error && (
                  <p className="mt-1 text-xs text-red-600">{result.live.shopifyVariant.error}</p>
                )}
              </div>

              <div className="border border-zinc-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Merchant live price</p>
                <p className="mt-1 font-mono text-lg font-semibold text-zinc-900">
                  {result.live.merchantProduct?.price
                    ? `${result.live.merchantProduct.currencyCode ?? "USD"} ${result.live.merchantProduct.price}`
                    : "Unavailable"}
                </p>
                {result.live.merchantProduct?.lastUpdateDate && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.live.merchantProduct.lastUpdateDate))}
                  </p>
                )}
                {result.live.merchantProduct?.error && (
                  <p className="mt-1 text-xs text-red-600">{result.live.merchantProduct.error}</p>
                )}
              </div>
            </div>
          )}

          {result.live?.priceComparison && (
            <div className="border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">{result.live.priceComparison.message}</span>
              {result.live.priceComparison.delta && (
                <span className="ml-2 font-mono text-xs text-zinc-500">
                  Delta {result.live.priceComparison.delta}
                </span>
              )}
            </div>
          )}

          {(result.live?.actions?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2 border border-zinc-200 bg-white p-3">
              <p className="text-sm font-medium text-zinc-900">Available agent actions</p>
              {(result.live?.actions ?? []).map((action) => (
                <div key={action.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{action.label}</p>
                    <p className="text-xs text-zinc-500">{action.disabled ? action.disabledReason : action.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyAction(action.id)}
                    disabled={action.disabled || actionState === "applying"}
                    className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                  >
                    {actionState === "applying" ? "Applying..." : "Apply"}
                  </button>
                </div>
              ))}
              {actionMessage && (
                <p className={`text-xs ${actionState === "error" ? "text-red-600" : "text-emerald-700"}`}>
                  {actionMessage}
                </p>
              )}
            </div>
          )}

          {result.links?.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {result.links.map((link) => (
                <a
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className="border border-zinc-200 bg-white p-3 text-sm hover:border-zinc-400 hover:bg-zinc-50"
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                  rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                >
                  <span className="font-medium text-zinc-900">{link.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    {link.description}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

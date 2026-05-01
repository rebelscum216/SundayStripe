"use client";

import { useState } from "react";
import { useDrawer } from "../../components/drawer-context";

type AiResult = { description: string; seoTitle: string; seoMetaDescription: string };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <button type="button" onClick={copy} className="text-xs text-zinc-500 hover:text-zinc-300">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function DescribeContent({ result }: { result: AiResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          AI Generated Copy
        </p>
        <p className="text-xs text-zinc-500">Review before applying to Shopify.</p>
      </div>
      <CopyField label="Description" value={result.description} />
      <CopyField label="SEO Title" value={result.seoTitle} />
      <CopyField label="SEO Meta Description" value={result.seoMetaDescription} />
    </div>
  );
}

export function AiDescribeButton({ productId }: { productId: string }) {
  const { open } = useDrawer();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function generate() {
    setState("loading");
    try {
      const res = await fetch("/api-proxy/ai/describe-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as AiResult;
      setState("idle");
      open(<DescribeContent result={data} />);
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
        className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {state === "loading" ? "Generating…" : "Generate copy with AI"}
      </button>
      {state === "error" && <span className="text-xs text-red-400">Failed — try again</span>}
    </div>
  );
}

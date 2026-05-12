"use client";

import { useState } from "react";
import { useDrawer } from "../../components/drawer-context";
import { generateProductCopy, type AiProductCopyResult } from "../../actions";

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
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink-3)" }}>{label}</span>
        <button type="button" onClick={copy} className="ss-btn ss-btn-sm">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p
        className="px-3 py-2"
        style={{
          border: "1px solid var(--ss-line)",
          borderRadius: 7,
          background: "var(--ss-bg-card)",
          color: "var(--ss-ink)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function DescribeContent({ result }: { result: AiProductCopyResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="ss-card" style={{ padding: 12 }}>
        <p style={{ marginBottom: 4, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-2)" }}>
          AI copy draft
        </p>
        <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Copy the fields you want to use, or use the SEO rewrite action when you need a reviewed Shopify update.</p>
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
      const data = await generateProductCopy(productId);
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
        className={`ss-btn ss-btn-sm ${state === "loading" ? "ss-btn-primary cursor-wait" : "ss-btn-primary"}`}
      >
        {state === "loading" ? "Generating..." : "Generate draft copy"}
      </button>
      {state === "error" && <span style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>Failed. Try again.</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useDrawer } from "../../components/drawer-context";
import { generateAmazonListingRewrite, type AmazonListingRewriteResult } from "../../actions";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button type="button" onClick={copy} className="ss-btn ss-btn-sm">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Field({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink-3)" }}>{label}</span>
        <CopyButton value={value} />
      </div>
      <p
        className="px-3 py-2"
        style={{
          border: "1px solid var(--ss-line)",
          borderRadius: 7,
          background: "var(--ss-bg-card)",
          color: "var(--ss-ink)",
          fontSize: 13,
          lineHeight: multiline ? 1.55 : 1.35,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function RewriteContent({ result }: { result: AmazonListingRewriteResult }) {
  return (
    <div className="flex flex-col gap-4" style={{ fontSize: 13, color: "var(--ss-ink)" }}>
      <p style={{ lineHeight: 1.55, color: "var(--ss-ink-2)" }}>{result.summary}</p>

      <Field label="Amazon Title" value={result.title} />
      <Field label="Backend Search Terms" value={result.searchTerms.join(", ")} />
      <Field label="Description" value={result.description} multiline />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ss-ink-3)" }}>Bullet Points</span>
          <CopyButton value={result.bullets.map((b) => `- ${b}`).join("\n")} />
        </div>
        <ul className="space-y-2 px-3 py-2" style={{ border: "1px solid var(--ss-line)", borderRadius: 7, background: "var(--ss-bg-card)" }}>
          {result.bullets.map((bullet, i) => (
            <li key={`${bullet}-${i}`} style={{ fontSize: 13, color: "var(--ss-ink)" }}>
              <span className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)" }}>{i + 1}.</span> {bullet}
            </li>
          ))}
        </ul>
      </div>

      {result.qualityFixes.length > 0 && (
        <div className="p-3" style={{ border: "1px solid var(--ss-amber-soft)", borderRadius: 7, background: "var(--ss-amber-soft)" }}>
          <p style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-amber-ink)" }}>
            Quality Score Fixes
          </p>
          <ul className="space-y-1.5">
            {result.qualityFixes.map((fix, i) => (
              <li key={`${fix.field}-${i}`} style={{ fontSize: 12, color: "var(--ss-amber-ink)" }}>
                <span className="font-medium">{fix.field}:</span> {fix.recommendation}
                {fix.issue && <span style={{ color: "var(--ss-ink-3)" }}> ({fix.issue})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AmazonListingRewrite({ productId }: { productId: string }) {
  const { open } = useDrawer();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function generate() {
    setState("loading");
    try {
      const data = await generateAmazonListingRewrite(productId);
      setState("idle");
      open(<RewriteContent result={data} />);
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
        {state === "loading" ? "Rewriting..." : "Draft Amazon rewrite"}
      </button>
      {state === "error" && <span style={{ fontSize: 12, color: "var(--ss-red-ink)" }}>Failed. Try again.</span>}
    </div>
  );
}

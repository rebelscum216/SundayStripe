"use client";

import { useState } from "react";
import { useDrawer } from "../../components/drawer-context";

type RewriteResult = {
  summary: string;
  title: string;
  bullets: string[];
  description: string;
  searchTerms: string[];
  qualityFixes: Array<{ field: string; issue: string; recommendation: string }>;
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button type="button" onClick={copy} className="text-xs text-zinc-500 hover:text-zinc-300">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Field({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <CopyButton value={value} />
      </div>
      <p className={`rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 ${multiline ? "leading-relaxed" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function RewriteContent({ result }: { result: RewriteResult }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="leading-relaxed text-zinc-400">{result.summary}</p>

      <Field label="Amazon Title" value={result.title} />
      <Field label="Backend Search Terms" value={result.searchTerms.join(", ")} />
      <Field label="Description" value={result.description} multiline />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Bullet Points</span>
          <CopyButton value={result.bullets.map((b) => `- ${b}`).join("\n")} />
        </div>
        <ul className="space-y-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
          {result.bullets.map((bullet, i) => (
            <li key={`${bullet}-${i}`} className="text-sm text-zinc-200">
              <span className="font-mono text-xs text-zinc-500">{i + 1}.</span> {bullet}
            </li>
          ))}
        </ul>
      </div>

      {result.qualityFixes.length > 0 && (
        <div className="rounded border border-amber-800/60 bg-amber-950/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
            Quality Score Fixes
          </p>
          <ul className="space-y-1.5">
            {result.qualityFixes.map((fix, i) => (
              <li key={`${fix.field}-${i}`} className="text-xs text-amber-300">
                <span className="font-medium">{fix.field}:</span> {fix.recommendation}
                {fix.issue && <span className="text-amber-500"> ({fix.issue})</span>}
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
      const res = await fetch("/api-proxy/ai/amazon-listing-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as RewriteResult;
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
        className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
      >
        {state === "loading" ? "Rewriting…" : "Amazon Listing Rewrite"}
      </button>
      {state === "error" && <span className="text-xs text-red-400">Failed — try again</span>}
    </div>
  );
}

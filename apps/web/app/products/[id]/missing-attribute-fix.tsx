"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type VariantForBarcode = { id: string; sku: string; title: string };

type Props = {
  productId: string;
  attribute: string;
  label: string;
  platforms: string[];
  variants?: VariantForBarcode[];
  currentSeoTitle?: string | null;
  currentSeoDescription?: string | null;
};

type UpdateResponse = {
  message?: string;
  pushed?: string[];
  queued?: string[];
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  amazon_sp: "Amazon",
};

function VariantBarcodeRow({
  productId,
  variant,
  platforms,
}: {
  productId: string;
  variant: VariantForBarcode;
  platforms: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function update() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api-proxy/products/${productId}/variants/${variant.id}/barcode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: trimmed, platforms }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as UpdateResponse;
      setMessage(result.message ?? "Updated barcode.");
      setState("saved");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update barcode.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-zinc-400">{variant.sku}</span>
        {variant.title !== variant.sku && (
          <span className="text-xs text-zinc-500">{variant.title}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter barcode / GTIN"
          disabled={state === "saved"}
          className="h-9 flex-1 rounded border border-amber-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={update}
          disabled={state === "saving" || state === "saved" || !value.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {state === "saving" ? "Saving..." : state === "saved" ? "Saved ✓" : "Update & push"}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${state === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function GtinExemptToggle({ productId }: { productId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  async function markExempt() {
    setState("saving");
    await fetch(`/api-proxy/products/${productId}/gtin-exempt`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exempt: true }),
    });
    setState("done");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={markExempt}
      disabled={state !== "idle"}
      className="self-start text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {state === "saving" ? "Saving…" : state === "done" ? "Marked exempt" : "No barcode — mark as GTIN exempt (print-on-demand)"}
    </button>
  );
}

function SeoUpdateRow({
  productId,
  currentSeoTitle,
  currentSeoDescription,
}: {
  productId: string;
  currentSeoTitle?: string | null;
  currentSeoDescription?: string | null;
}) {
  const router = useRouter();
  const [seoTitle, setSeoTitle] = useState(currentSeoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(currentSeoDescription ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function update() {
    if (!seoTitle.trim()) return;
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api-proxy/products/${productId}/seo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seoTitle: seoTitle.trim(), seoDescription: seoDescription.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("SEO title updated on Shopify.");
      setState("saved");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update SEO title.");
      setState("error");
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 sm:mt-0 sm:min-w-[360px]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">SEO Title <span className="text-zinc-600">(max 60 chars)</span></label>
          <input
            type="text"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            maxLength={60}
            placeholder="Enter SEO title"
            disabled={state === "saved"}
            className="h-9 rounded border border-amber-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Meta Description <span className="text-zinc-600">(max 160 chars, optional)</span></label>
          <input
            type="text"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            maxLength={160}
            placeholder="Enter meta description"
            disabled={state === "saved"}
            className="h-9 rounded border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={update}
        disabled={state === "saving" || state === "saved" || !seoTitle.trim()}
        className="self-start rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
      >
        {state === "saving" ? "Saving..." : state === "saved" ? "Saved ✓" : "Update & push"}
      </button>
      <p className="text-xs text-amber-500/70">Updates Shopify SEO metafields now.</p>
      {message && (
        <p className={`text-xs ${state === "error" ? "text-red-400" : "text-emerald-400"}`}>{message}</p>
      )}
    </div>
  );
}

export function MissingAttributeFix({ productId, attribute, label, platforms, variants, currentSeoTitle, currentSeoDescription }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (attribute === "seo_title") {
    return <SeoUpdateRow productId={productId} currentSeoTitle={currentSeoTitle} currentSeoDescription={currentSeoDescription} />;
  }

  if (attribute === "barcode" && variants && variants.length > 0) {
    return (
      <div className="mt-2 flex flex-col gap-3 sm:mt-0 sm:min-w-[360px]">
        {variants.map((v) => (
          <VariantBarcodeRow key={v.id} productId={productId} variant={v} platforms={platforms} />
        ))}
        <GtinExemptToggle productId={productId} />
      </div>
    );
  }

  const supported = attribute === "brand";

  async function updateAttribute() {
    const trimmed = value.trim();
    if (!trimmed || !supported) return;

    setState("saving");
    setMessage(null);
    try {
      const response = await fetch(`/api-proxy/products/${productId}/attributes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attribute, value: trimmed, platforms }),
      });

      if (!response.ok) throw new Error(await response.text());

      const result = (await response.json()) as UpdateResponse;
      const pushed = result.pushed?.map((platform) => PLATFORM_LABELS[platform] ?? platform) ?? [];
      const queued = result.queued?.map((platform) => PLATFORM_LABELS[platform] ?? platform) ?? [];
      setMessage(
        result.message ??
          [
            pushed.length > 0 ? `Updated ${pushed.join(", ")}` : null,
            queued.length > 0 ? `Queued ${queued.join(", ")} sync` : null,
          ].filter(Boolean).join(". "),
      );
      setState("saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update attribute.");
      setState("error");
    }
  }

  if (!supported) {
    return (
      <a
        href="#ai-actions"
        className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
      >
        Open fix tools
      </a>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 sm:mt-0 sm:min-w-[360px]">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`Enter ${label.toLowerCase()}`}
          className="h-9 flex-1 rounded border border-amber-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={updateAttribute}
          disabled={state === "saving" || !value.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {state === "saving" ? "Updating..." : "Update & push"}
        </button>
      </div>
      <p className="text-xs text-amber-500/70">
        Updates Shopify now, then queues Merchant and Amazon to re-check this listing.
      </p>
      {message && (
        <p className={`text-xs ${state === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

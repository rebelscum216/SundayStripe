"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AmazonSku = { variantId: string; sku: string };

type Props = {
  productId: string;
  attributeName: string;
  skus: AmazonSku[];
};

const fieldStyle = {
  border: "1px solid var(--ss-line-strong)",
  background: "var(--ss-bg-card)",
  color: "var(--ss-ink)",
  borderRadius: 7,
  boxShadow: "0 1px 0 rgba(26, 24, 21, 0.03)",
} as const;

export function AmazonAttributeFix({ productId, attributeName, skus }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || skus.length === 0) return;
    setState("saving");
    setMessage(null);

    try {
      // Patch each Amazon SKU for this product
      await Promise.all(
        skus.map((s) =>
          fetch(`/api-proxy/products/${productId}/amazon-attribute`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sku: s.sku, attributeName, value: trimmed }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await res.text());
          }),
        ),
      );
      setMessage(`Updated ${attributeName} on Amazon.`);
      setState("saved");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update Amazon listing.");
      setState("error");
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Enter ${attributeName.replace(/_/g, " ")}`}
          disabled={state === "saved"}
          className="h-9 flex-1 px-3 text-sm disabled:opacity-50"
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={save}
          disabled={state === "saving" || state === "saved" || !value.trim()}
          className="ss-btn ss-btn-sm ss-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Push to Amazon"}
        </button>
      </div>
      {message && (
        <p style={{ fontSize: 12, color: state === "error" ? "var(--ss-red-ink)" : "var(--ss-sage-ink)" }}>
          {message}
        </p>
      )}
    </div>
  );
}

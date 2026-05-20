"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  productId: string;
  descriptionHtml: string | null;
};

const fieldStyle = {
  border: "1px solid var(--ss-line-strong)",
  background: "var(--ss-bg-card)",
  color: "var(--ss-ink)",
  borderRadius: 7,
  boxShadow: "0 1px 0 rgba(26, 24, 21, 0.03)",
} as const;

function stripHtml(value: string | null) {
  return value ? value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim() : "";
}

export function ProductDescriptionEditor({ productId, descriptionHtml }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(stripHtml(descriptionHtml));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState("saving");
    setMessage(null);
    try {
      const response = await fetch(`/api-proxy/products/${productId}/attributes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptionHtml: trimmed }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? "Description saved.");
      setState("saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save description.");
      setState("error");
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="ss-card"
      style={{
        padding: 0,
        borderColor: open ? "var(--ss-amber-soft)" : "var(--ss-line)",
        background: open ? "color-mix(in oklab, var(--ss-amber-soft) 12%, var(--ss-bg-card))" : "var(--ss-bg-card)",
      }}
    >
      <summary
        className="cursor-pointer select-none"
        style={{
          padding: "12px 16px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ss-ink)",
          listStyle: "none",
        }}
      >
        <span style={{ marginRight: 8, color: "var(--ss-orange)" }}>{open ? "-" : "+"}</span>
        Description
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--ss-ink-3)" }}>
          {value.trim() ? `${value.trim().length} chars` : "empty"}
        </span>
      </summary>
      <div className="flex flex-col gap-3" style={{ borderTop: "1px solid var(--ss-line)", padding: 16 }}>
        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (state !== "idle") {
              setState("idle");
              setMessage(null);
            }
          }}
          rows={6}
          className="w-full px-3 py-2 text-sm"
          placeholder="Write the product description"
          style={fieldStyle}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={state === "saving" || !value.trim()}
            className="ss-btn ss-btn-sm ss-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "saving" ? "Saving..." : state === "saved" ? "Saved ✓" : "Save"}
          </button>
          {message && (
            <span style={{ fontSize: 12, color: state === "error" ? "var(--ss-red-ink)" : "var(--ss-sage-ink)" }}>
              {message}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}

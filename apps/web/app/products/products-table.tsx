"use client";

import { useMemo, useState } from "react";
import { ChannelBadge as PlatformBadge } from "../components/channel-badge";
import { QualityScoreBadge } from "./quality-score-badge";

type Channel = { platform: string; status: string };

export type Product = {
  id: string;
  title: string | null;
  canonicalSku: string;
  updatedAt: string | null;
  variantCount: number;
  availableInventory: number;
  missingAttributes: string[];
  amazonQualityScore: number | null;
  channels: Channel[];
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  search_console: "GSC",
  amazon_sp: "Amazon",
};

const ATTR_LABELS: Record<string, string> = {
  title: "Title",
  brand: "Brand",
  barcode: "Barcode / GTIN",
  description: "Description",
  seo_title: "SEO Title",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function isKnownPlatform(platform: string): platform is "shopify" | "merchant" | "amazon_sp" | "search_console" {
  return platform === "shopify" || platform === "merchant" || platform === "amazon_sp" || platform === "search_console";
}

type StatusFilter = "all" | "published" | "issue" | "disapproved" | "unlisted" | "no_listings";

const STATUS_PRIORITY: Record<string, number> = { disapproved: 4, issue: 3, unlisted: 2, published: 1 };

function getWorstStatus(channels: Channel[]): StatusFilter {
  if (channels.length === 0) return "no_listings";
  return channels.slice(1).reduce<Channel>((worst, ch) =>
    (STATUS_PRIORITY[ch.status] ?? 0) > (STATUS_PRIORITY[worst.status] ?? 0) ? ch : worst
  , channels[0]).status as StatusFilter;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "issue", label: "Has Issues" },
  { value: "disapproved", label: "Disapproved" },
  { value: "unlisted", label: "Unlisted" },
  { value: "no_listings", label: "No Listings" },
];

const COVERAGE_PLATFORMS = ["merchant", "amazon_sp"];
const TRACKED_ATTRS = ["title", "brand", "barcode", "description", "seo_title"] as const;

type GapChip =
  | { kind: "channel"; platform: string; missing: number }
  | { kind: "attr"; attr: string; missing: number }
  | { kind: "quality"; count: number };

function computeGaps(products: Product[]): GapChip[] {
  const chips: GapChip[] = [];

  for (const platform of COVERAGE_PLATFORMS) {
    const missing = products.filter((p) => !p.channels.some((c) => c.platform === platform)).length;
    if (missing > 0) chips.push({ kind: "channel", platform, missing });
  }

  for (const attr of TRACKED_ATTRS) {
    const missing = products.filter((p) => p.missingAttributes.includes(attr)).length;
    if (missing > 0) chips.push({ kind: "attr", attr, missing });
  }

  const lowAmazonQuality = products.filter(
    (p) => p.amazonQualityScore !== null && p.amazonQualityScore < 50
  ).length;
  if (lowAmazonQuality > 0) chips.push({ kind: "quality", count: lowAmazonQuality });

  return chips;
}

type ActiveGap =
  | { kind: "channel"; platform: string }
  | { kind: "attr"; attr: string }
  | { kind: "quality" }
  | null;

function gapKey(gap: GapChip): string {
  if (gap.kind === "quality") return "quality";
  return gap.kind === "channel" ? `channel:${gap.platform}` : `attr:${gap.attr}`;
}

function activeKey(active: ActiveGap): string | null {
  if (!active) return null;
  if (active.kind === "quality") return "quality";
  return active.kind === "channel" ? `channel:${active.platform}` : `attr:${active.attr}`;
}

function gapFromParam(value: string | null): ActiveGap {
  if (!value) return null;
  if (value === "quality") return { kind: "quality" };
  if (COVERAGE_PLATFORMS.includes(value)) return { kind: "channel", platform: value };
  if ((TRACKED_ATTRS as readonly string[]).includes(value)) return { kind: "attr", attr: value };
  if (value.startsWith("channel:")) return { kind: "channel", platform: value.replace("channel:", "") };
  if (value.startsWith("attr:")) return { kind: "attr", attr: value.replace("attr:", "") };
  return null;
}

function CompletenessIndicator({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <span
      title={`Missing: ${missing.map((a) => ATTR_LABELS[a] ?? a).join(", ")}`}
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded border border-amber-500 bg-amber-950 text-[10px] font-semibold text-amber-400"
    >
      {missing.length}
    </span>
  );
}

type ProductsTableProps = {
  products: Product[];
  initialQuery?: string;
  initialGap?: string;
};

export function ProductsTable({ products, initialQuery, initialGap }: ProductsTableProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [activeGap, setActiveGap] = useState<ActiveGap>(gapFromParam(initialGap ?? null));

  const gaps = useMemo(() => computeGaps(products), [products]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return products.filter((p) => {
      if (q && !p.title?.toLowerCase().includes(q) && !p.canonicalSku.toLowerCase().includes(q)) {
        return false;
      }
      if (status !== "all" && getWorstStatus(p.channels) !== status) {
        return false;
      }
      if (activeGap?.kind === "channel" && p.channels.some((c) => c.platform === activeGap.platform)) {
        return false;
      }
      if (activeGap?.kind === "attr" && !p.missingAttributes.includes(activeGap.attr)) {
        return false;
      }
      if (
        activeGap?.kind === "quality" &&
        (p.amazonQualityScore === null || p.amazonQualityScore >= 50)
      ) {
        return false;
      }
      return true;
    });
  }, [products, query, status, activeGap]);

  const hasActiveFilter = query.trim() || status !== "all" || activeGap;

  function toggleGap(chip: GapChip) {
    const key = gapKey(chip);
    setActiveGap((prev) => (activeKey(prev) === key ? null : chip.kind === "channel"
      ? { kind: "channel", platform: chip.platform }
      : chip.kind === "quality"
        ? { kind: "quality" }
        : { kind: "attr", attr: chip.attr }));
  }

  return (
    <>
      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveGap(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !activeGap
              ? "border-blue-500 bg-blue-950 text-blue-300"
              : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          All
        </button>
        {gaps.map((chip) => {
          const isActive = activeKey(activeGap) === gapKey(chip);
          const label =
            chip.kind === "channel"
              ? chip.platform === "amazon_sp"
                ? "No Amazon"
                : chip.platform === "merchant"
                  ? "No Merchant"
                  : `No ${PLATFORM_LABELS[chip.platform] ?? chip.platform}`
              : chip.kind === "quality"
                ? "Low Quality Score"
                : `Missing ${ATTR_LABELS[chip.attr] ?? chip.attr}`;
          const count = chip.kind === "quality" ? chip.count : chip.missing;

          return (
            <button
              key={gapKey(chip)}
              type="button"
              onClick={() => toggleGap(chip)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-950 text-blue-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {label}
              <span className="ml-2 font-mono text-zinc-500">{count}</span>
            </button>
          );
        })}
      </section>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search title or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full max-w-xs rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none sm:max-w-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-9 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {hasActiveFilter && (
            <button type="button" onClick={() => { setQuery(""); setStatus("all"); setActiveGap(null); }}
              className="h-9 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:bg-zinc-800">
              Clear
            </button>
          )}
        </div>
        <span className="font-mono text-sm text-zinc-400">
          {filtered.length !== products.length
            ? `${filtered.length} of ${products.length}`
            : `${new Intl.NumberFormat("en").format(products.length)} products`}
        </span>
      </div>

      <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Variants</th>
                <th className="px-4 py-3 text-right">Inventory</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Amazon Score</th>
                <th className="px-4 py-3">Gaps</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  className="cursor-pointer border-b border-zinc-800/60 hover:bg-zinc-800/40"
                  key={product.id}
                  onClick={() => {
                    window.location.href = `/products/${product.id}`;
                  }}
                >
                  <td className="max-w-[280px] px-4 py-3 font-medium">
                    <span className="flex items-center gap-1 text-zinc-100">
                      <a
                        href={`/products/${product.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="truncate hover:underline"
                      >
                        {product.title ?? <span className="italic text-zinc-400">No title</span>}
                      </a>
                      <CompletenessIndicator missing={product.missingAttributes} />
                    </span>
                    <span className="mt-1 block font-mono text-xs text-zinc-500">
                      {product.canonicalSku}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">{product.variantCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {new Intl.NumberFormat("en").format(product.availableInventory)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {product.channels.length > 0
                        ? product.channels.map((ch) =>
                            isKnownPlatform(ch.platform) ? (
                              <PlatformBadge key={ch.platform} platform={ch.platform} />
                            ) : (
                              <span
                                key={ch.platform}
                                className="inline-flex items-center border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-100"
                              >
                                {PLATFORM_LABELS[ch.platform] ?? ch.platform}
                              </span>
                            ),
                          )
                        : <span className="text-xs text-zinc-400">No listings</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {product.amazonQualityScore != null ? (
                      <QualityScoreBadge score={product.amazonQualityScore} />
                    ) : (
                      <span className="text-xs text-zinc-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {product.missingAttributes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {product.missingAttributes.map((attr) => (
                          <span
                            className="rounded border border-amber-500 bg-amber-950 px-1.5 py-0.5 text-xs text-amber-400"
                            key={attr}
                          >
                            {ATTR_LABELS[attr] ?? attr}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-zinc-400" colSpan={6}>
                    {products.length === 0 ? "No products found." : "No products match the filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

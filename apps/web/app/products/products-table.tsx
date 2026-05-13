"use client";

import { useMemo, useState } from "react";
import { ChannelBadge as PlatformBadge } from "../components/channel-badge";
import { QualityScoreBadge } from "./quality-score-badge";

type Channel = { platform: string; status: string; suppressed?: boolean };

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
  revenueCents?: number;
  gscClicks?: number;
  gscImpressions?: number;
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
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
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
  { value: "unlisted", label: "Not for Sale" },
  { value: "no_listings", label: "No Listings" },
];

const COVERAGE_PLATFORMS = ["merchant", "amazon_sp"];
const TRACKED_ATTRS = ["title", "brand", "barcode", "description"] as const;

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
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center ss-num"
      style={{ borderRadius: 999, background: "var(--ss-amber-soft)", color: "var(--ss-amber-ink)", fontSize: 10, fontWeight: 600 }}
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
  const showRevenue = products.some((product) => product.revenueCents !== undefined);
  const showGsc = products.some(
    (product) => product.gscClicks !== undefined || product.gscImpressions !== undefined,
  );
  const emptyColSpan = 5 + (showRevenue ? 1 : 0) + (showGsc ? 2 : 0);
  const tableMinWidth = 720 + (showRevenue ? 120 : 0) + (showGsc ? 200 : 0);

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
          className="ss-btn ss-btn-sm"
          style={!activeGap ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
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
              className="ss-btn ss-btn-sm"
              style={isActive ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : undefined}
            >
              {label}
              <span className="ss-num" style={{ marginLeft: 8, color: isActive ? "var(--ss-orange-ink)" : "var(--ss-ink-3)" }}>{count}</span>
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
            className="h-9 w-full max-w-xs px-3 text-sm sm:max-w-sm"
            style={{ borderRadius: 7, border: "1px solid var(--ss-line)", background: "var(--ss-bg-card)", color: "var(--ss-ink)", outline: "none" }}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-9 px-3 text-sm"
            style={{ borderRadius: 7, border: "1px solid var(--ss-line)", background: "var(--ss-bg-card)", color: "var(--ss-ink)", outline: "none" }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {hasActiveFilter && (
            <button type="button" onClick={() => { setQuery(""); setStatus("all"); setActiveGap(null); }}
              className="ss-btn">
              Clear
            </button>
          )}
        </div>
        <span className="ss-num" style={{ fontSize: 14, color: "var(--ss-ink-3)" }}>
          {filtered.length !== products.length
            ? `${filtered.length} of ${products.length}`
            : `${new Intl.NumberFormat("en").format(products.length)} products`}
        </span>
      </div>

      <section className="ss-card" style={{ overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="ss-tbl" style={{ minWidth: tableMinWidth }}>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: "right" }}>Variants</th>
                <th style={{ textAlign: "right" }}>Inventory</th>
                {showRevenue && <th style={{ textAlign: "right" }}>Revenue</th>}
                {showGsc && <th style={{ textAlign: "right" }}>GSC Clicks</th>}
                {showGsc && <th style={{ textAlign: "right" }}>GSC Impr.</th>}
                <th>Channels</th>
                <th>Amazon Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr
                  className="cursor-pointer"
                  key={product.id}
                  onClick={() => {
                    window.location.href = `/products/${product.id}`;
                  }}
                >
                  <td className="max-w-[280px]" style={{ fontWeight: 500 }}>
                    <span className="flex items-center gap-1" style={{ color: "var(--ss-ink)" }}>
                      <a
                        href={`/products/${product.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="truncate"
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {product.title ?? <span style={{ fontStyle: "italic", color: "var(--ss-ink-3)" }}>No title</span>}
                      </a>
                      <CompletenessIndicator missing={product.missingAttributes} />
                    </span>
                    <span className="ss-num" style={{ marginTop: 4, display: "block", fontSize: 12, color: "var(--ss-ink-3)" }}>
                      {product.canonicalSku}
                    </span>
                  </td>
                  <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{product.variantCount}</td>
                  <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                    {formatNumber(product.availableInventory)}
                  </td>
                  {showRevenue && (
                    <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                      {product.revenueCents === undefined ? "-" : formatCurrency(product.revenueCents)}
                    </td>
                  )}
                  {showGsc && (
                    <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                      {product.gscClicks === undefined ? "-" : formatNumber(product.gscClicks)}
                    </td>
                  )}
                  {showGsc && (
                    <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                      {product.gscImpressions === undefined ? "-" : formatNumber(product.gscImpressions)}
                    </td>
                  )}
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {product.channels.length > 0
                        ? product.channels.map((ch) =>
                            isKnownPlatform(ch.platform) ? (
                              <PlatformBadge key={ch.platform} platform={ch.platform} status={ch.status} suppressed={ch.suppressed} />
                            ) : (
                              <span
                                key={ch.platform}
                                className="ss-pill"
                              >
                                {PLATFORM_LABELS[ch.platform] ?? ch.platform}
                              </span>
                            ),
                          )
                        : <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>No listings</span>}
                    </div>
                  </td>
                  <td>
                    {product.amazonQualityScore != null ? (
                      <QualityScoreBadge score={product.amazonQualityScore} />
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td style={{ padding: 24, color: "var(--ss-ink-3)" }} colSpan={emptyColSpan}>
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

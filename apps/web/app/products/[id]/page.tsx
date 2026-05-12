import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { resolveAlert } from "../../actions";
import { AmazonListingRewrite } from "./amazon-listing-rewrite";
import { AiDescribeButton } from "./ai-describe";
import { MissingAttributeFix } from "./missing-attribute-fix";
import { ProductFixAssistant } from "./product-fix-assistant";
import { ProductSeoOpportunity } from "./product-seo-opportunity";
import { QualityScoreBadge } from "../quality-score-badge";
import { AmazonAttributeFix } from "./amazon-attribute-fix";

type RevenueData = {
  periodDays: number;
  unitsSold: number;
  revenueCents: number;
  topVariants: { sku: string; size: string | null; unitsSold: number; revenueCents: number }[];
};
type Quantity = { name: string; value: number };
type InventoryLocation = { locationKey: string; name: string; quantities: Quantity[] };
type Listing = {
  platform: string;
  status: string | null;
  buyabilityStatus: string | null;
  issuesJson: unknown;
  qualityScore: number | null;
  platformListingId: string | null;
};
type Variant = {
  id: string;
  sku: string;
  title: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  listings: Listing[];
  inventory: InventoryLocation[];
};
type Issue = {
  code?: string;
  severity?: string;
  // Amazon SP-API fields
  message?: string;
  attributeNames?: string[];
  categories?: string[];
  enforcements?: { actions?: { action?: string }[] };
  // Merchant / legacy fields
  description?: string;
  attribute?: string;
  resolution?: string;
};

const ISSUE_ACTION_LABEL: Record<string, string> = {
  SEARCH_SUPPRESSED: "Search suppressed",
  DETAIL_PAGE_REMOVED: "Detail page removed",
  BUYABILITY_SUSPENDED: "Buyability suspended",
};

const ISSUE_CATEGORY_HINT: Record<string, string> = {
  MISSING_ATTRIBUTE: "Add the missing attribute to your listing.",
  INVALID_VALUE: "Correct the invalid attribute value.",
  UNRECOGNIZED_VALUE: "Replace with a valid option.",
};
type AlertPayload = {
  title?: string;
  merchant_product_name?: string;
  offer_id?: string;
  issues?: Issue[];
};
type Alert = {
  id: string;
  severity: string;
  category: string;
  sourcePlatform: string | null;
  entityRef: string | null;
  payloadJson: AlertPayload | null;
  createdAt: string;
};
type GscPageRow = { url: string; clicks: number; impressions: number; ctr: number; position: number };
type GscQueryRow = { query: string; landingUrl: string | null; clicks: number; impressions: number; ctr: number; position: number };
type GscData = { handle: string; dataSource: "exact" | "fuzzy"; pages: GscPageRow[]; queries: GscQueryRow[] };
type ProductDetail = {
  product: {
    id: string;
    title: string | null;
    canonicalSku: string;
    brand: string | null;
    descriptionHtml: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    featuredImageUrl: string | null;
    gtinExempt: boolean;
    sourceOfTruth: string;
    sourceUpdatedAt: string | null;
    updatedAt: string | null;
  };
  variants: Variant[];
  alerts: Alert[];
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getProductDetail(id: string): Promise<ProductDetail | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/products/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ProductDetail;
  } catch { return null; }
}

async function getProductGsc(id: string): Promise<GscData | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/products/${id}/gsc`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as GscData;
  } catch { return null; }
}

async function getProductRevenue(id: string): Promise<RevenueData | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/products/${id}/revenue`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RevenueData;
  } catch { return null; }
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  search_console: "GSC",
  amazon_sp: "Amazon",
};

const STATUS_BADGE: Record<string, string> = {
  published: "ss-pill ss-pill-sage",
  issue: "ss-pill ss-pill-amber",
  disapproved: "ss-pill ss-pill-red",
  unlisted: "ss-pill",
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "ss-pill ss-pill-red",
  critical: "ss-pill ss-pill-red",
  info: "ss-pill",
};

const ISSUE_SEV_COLOR: Record<string, string> = {
  critical: "var(--ss-red-ink)",
  error: "var(--ss-orange)",
  warning: "var(--ss-amber-ink)",
  suggestion: "var(--ss-ink-3)",
};

const QUANTITY_ORDER = ["available", "committed", "on_hand", "incoming"];

function getLocationNameMap(): Record<string, string> {
  const raw = process.env.SHOPIFY_LOCATION_NAME_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
      ),
    );
  } catch { return {}; }
}

const LOCATION_NAME_MAP = getLocationNameMap();

function formatLocationKey(key: string): string {
  if (LOCATION_NAME_MAP[key]) return LOCATION_NAME_MAP[key];
  const match = key.match(/\/([^/]+)\/(\d+)$/);
  if (match) {
    const [, type, id] = match;
    return LOCATION_NAME_MAP[id] ?? `${type} ${id}`;
  }
  return key;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getQuantity(quantities: Quantity[], name: string): number {
  return quantities.find((q) => q.name === name)?.value ?? 0;
}

function buildInventorySummary(variants: Variant[]) {
  const byLocation = new Map<string, { name: string; quantities: Map<string, number> }>();
  for (const v of variants) {
    for (const loc of v.inventory) {
      if (!byLocation.has(loc.locationKey)) byLocation.set(loc.locationKey, { name: loc.name, quantities: new Map() });
      const entry = byLocation.get(loc.locationKey)!;
      for (const q of loc.quantities) entry.quantities.set(q.name, (entry.quantities.get(q.name) ?? 0) + q.value);
    }
  }
  return Array.from(byLocation.entries()).map(([locationKey, { name, quantities }]) => ({
    locationKey,
    name,
    quantities: QUANTITY_ORDER.map((qName) => ({ name: qName, value: quantities.get(qName) ?? 0 })),
  }));
}

function fmt(n: number) { return new Intl.NumberFormat("en").format(n); }
function currency(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <h2 className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>
    {title}
    {count !== undefined && (
      <span className="ss-num" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--ss-ink-4)" }}>{count}</span>
    )}
  </h2>
);

function HeaderStat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "sage" | "amber" }) {
  const color = tone === "sage" ? "var(--ss-sage-ink)" : tone === "amber" ? "var(--ss-amber-ink)" : "var(--ss-ink)";
  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{label}</p>
      <p className="ss-num" style={{ fontFamily: "var(--ss-font-display)", fontSize: 24, fontWeight: 600, color }}>{value}</p>
    </div>
  );
}

function CardHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>{title}</h3>
      {children}
    </div>
  );
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [data, gsc, revenue] = await Promise.all([
    getProductDetail(params.id),
    getProductGsc(params.id),
    getProductRevenue(params.id),
  ]);

  if (!data) {
    notFound();
  }

  const { product, variants, alerts } = data;
  const inventorySummary = buildInventorySummary(variants);
  const totalAvailable = inventorySummary.reduce(
    (sum, loc) => sum + getQuantity(loc.quantities, "available"), 0,
  );
  const platforms = [...new Set(variants.flatMap((v) => v.listings.map((l) => l.platform)))];

  const missingAttributes: { attr: string; label: string; detail: string; platforms: string[]; variants?: { id: string; sku: string; title: string }[]; currentSeoTitle?: string | null; currentSeoDescription?: string | null; currentDescription?: string | null }[] = [];
  if (!product.title?.trim())
    missingAttributes.push({ attr: "title", label: "Title", detail: "Required by all channels.", platforms: ["shopify", "merchant", "amazon_sp"] });
  if (!product.brand?.trim())
    missingAttributes.push({ attr: "brand", label: "Brand", detail: "Required by Google Merchant Center and Amazon.", platforms: ["shopify", "merchant", "amazon_sp"] });
  const variantsMissingBarcode = variants.filter((v) => !v.barcode?.trim());
  if (!product.gtinExempt && variantsMissingBarcode.length > 0)
    missingAttributes.push({ attr: "barcode", label: "Barcode / GTIN", detail: "Required for Merchant Center and Amazon catalog matching.", platforms: ["shopify", "merchant", "amazon_sp"], variants: variantsMissingBarcode.map((v) => ({ id: v.id, sku: v.sku, title: v.title })) });
  if (!product.descriptionHtml || product.descriptionHtml.trim().length < 10)
    missingAttributes.push({ attr: "description", label: "Description", detail: "Improves search ranking and listing quality.", platforms: ["shopify", "merchant", "amazon_sp"], currentDescription: product.descriptionHtml ?? null });

  const amazonSkus = variants.flatMap((v) =>
    v.listings
      .filter((l) => l.platform === "amazon_sp" && l.platformListingId)
      .map((l) => ({ variantId: v.id, sku: l.platformListingId! }))
  );

  const amazonMissingAttrNames = [
    ...new Set(
      alerts
        .filter((a) => (a.sourcePlatform ?? "") === "amazon_sp")
        .flatMap((a) => (a.payloadJson?.issues ?? []) as Issue[])
        .filter((i) => i.categories?.includes("MISSING_ATTRIBUTE") && i.attributeNames?.length)
        .flatMap((i) => i.attributeNames ?? []),
    ),
  ];

  const totalMissing = missingAttributes.length + (amazonSkus.length > 0 ? amazonMissingAttrNames.length : 0);
  const seoActionQuery = firstParam(searchParams?.query);
  const seoActionUrl = firstParam(searchParams?.url);
  const seoActionPosition = Number(firstParam(searchParams?.position));
  const seoActionImpressions = Number(firstParam(searchParams?.impressions));
  const showSeoOpportunity =
    firstParam(searchParams?.ai) === "seo-rewrite" &&
    Boolean(seoActionQuery) &&
    Number.isFinite(seoActionPosition) &&
    Number.isFinite(seoActionImpressions);

  return (
    <div className="ss-content-stack">
      {/* Header */}
      <div>
        <a href="/products" style={{ fontSize: 14, color: "var(--ss-ink-3)", textDecoration: "none" }}>
          ← Products
        </a>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3" style={{ borderBottom: "1px solid var(--ss-line)", paddingBottom: 20 }}>
          <div className="flex items-start gap-5">
            {product.featuredImageUrl && (
              <img
                src={product.featuredImageUrl}
                alt={product.title ?? product.canonicalSku}
                width={96}
                height={96}
                style={{
                  width: 96,
                  height: 96,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid var(--ss-line)",
                  flexShrink: 0,
                  background: "var(--ss-bg-elev)",
                }}
              />
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>Product</p>
              <h1 className="mt-1 text-3xl md:text-4xl" style={{ fontFamily: "var(--ss-font-display)", fontWeight: 600, color: "var(--ss-ink)", letterSpacing: "-0.02em" }}>
                {product.title ?? product.canonicalSku}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="ss-num" style={{ fontSize: 14, color: "var(--ss-ink-3)" }}>{product.canonicalSku}</span>
                {product.brand && <span style={{ fontSize: 14, color: "var(--ss-ink-3)" }}>{product.brand}</span>}
                <span className="ss-pill">
                  source: {product.sourceOfTruth}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 text-right">
            <HeaderStat label="Variants" value={variants.length} />
            <HeaderStat label="Available" value={fmt(totalAvailable)} />
            {revenue && revenue.revenueCents > 0 && (
              <HeaderStat label="Revenue (90d)" value={currency(revenue.revenueCents)} tone="sage" />
            )}
            {alerts.length > 0 && (
              <HeaderStat label="Open Issues" value={alerts.length} tone="amber" />
            )}
          </div>
        </div>
      </div>

      {/* Missing attributes */}
      {totalMissing > 0 && (
        <div
          className="ss-card"
          style={{
            padding: "22px 26px",
            borderColor: "var(--ss-amber-soft)",
            background: "color-mix(in oklab, var(--ss-amber-soft) 25%, var(--ss-bg-card))",
          }}
        >
          <p style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: "var(--ss-amber-ink)" }}>
            {totalMissing} missing attribute{totalMissing !== 1 ? "s" : ""}
            <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ss-ink-3)" }}>— required for channel listing quality</span>
          </p>
          <ul className="space-y-3">
            {missingAttributes.map((item) => (
              <li
                key={item.attr}
                className="flex flex-col justify-between gap-4 pt-4 first:pt-0 sm:flex-row sm:items-start"
                style={{ borderTop: "1px solid color-mix(in oklab, var(--ss-amber-soft) 55%, transparent)" }}
              >
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ss-amber-ink)" }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{item.detail}</span>
                </div>
                <MissingAttributeFix
                  productId={product.id}
                  attribute={item.attr}
                  label={item.label}
                  platforms={item.platforms}
                  variants={item.variants}
                  currentSeoTitle={item.currentSeoTitle}
                  currentSeoDescription={item.currentSeoDescription}
                  currentDescription={item.currentDescription}
                />
              </li>
            ))}
            {amazonSkus.length > 0 && amazonMissingAttrNames.map((attrName) => (
              <li
                key={`amazon-${attrName}`}
                className="flex flex-col justify-between gap-4 pt-4 sm:flex-row sm:items-start"
                style={{ borderTop: "1px solid color-mix(in oklab, var(--ss-amber-soft) 55%, transparent)" }}
              >
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ss-amber-ink)" }}>
                    {attrName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Required by Amazon — search suppressed until added.</span>
                </div>
                <AmazonAttributeFix
                  productId={product.id}
                  attributeName={attrName}
                  skus={amazonSkus}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Actions */}
      <section id="ai-actions" className="flex flex-col gap-3">
        <SectionHeader title="AI Actions" />
        <div className="ss-card" style={{ padding: 16 }}>
          {showSeoOpportunity && seoActionQuery && (
            <ProductSeoOpportunity
              productId={product.id}
              productTitle={product.title}
              currentSeoTitle={product.seoTitle}
              currentSeoDescription={product.seoDescription}
              query={seoActionQuery}
              url={seoActionUrl ?? `/products/${product.canonicalSku}`}
              position={seoActionPosition}
              impressions={seoActionImpressions}
            />
          )}
          {(product.seoTitle || product.seoDescription) && (
            <div className="mb-4 flex flex-col gap-2">
              <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>
                Current Shopify SEO
              </p>
              {product.seoTitle && (
                <div>
                  <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>SEO Title</p>
                  <p style={{ marginTop: 2, fontSize: 14, color: "var(--ss-ink-2)" }}>{product.seoTitle}</p>
                </div>
              )}
              {product.seoDescription && (
                <div>
                  <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>SEO Meta Description</p>
                  <p style={{ marginTop: 2, fontSize: 14, color: "var(--ss-ink-2)" }}>{product.seoDescription}</p>
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--ss-line)", paddingTop: 12 }} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <AiDescribeButton productId={product.id} />
            <ProductFixAssistant productId={product.id} />
            <AmazonListingRewrite productId={product.id} />
          </div>
        </div>
      </section>

      {/* Revenue */}
      {revenue && revenue.unitsSold > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Revenue — last 90 days" />
          <div className="ss-card" style={{ overflow: "hidden" }}>
            <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
              <div className="flex items-center gap-5">
                <HeaderStat label="Units" value={fmt(revenue.unitsSold)} />
                <HeaderStat label="Revenue" value={currency(revenue.revenueCents)} tone="sage" />
              </div>
            </div>
            {revenue.topVariants.length > 0 && (
              <table className="ss-tbl">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Size</th>
                    <th style={{ textAlign: "right" }}>Units</th>
                    <th style={{ textAlign: "right" }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.topVariants.map((v, i) => (
                    <tr key={i}>
                      <td className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{v.sku}</td>
                      <td style={{ color: "var(--ss-ink-2)" }}>{v.size ?? "—"}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{v.unitsSold}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-sage-ink)" }}>{currency(v.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* Variants */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Variants" count={variants.length} />
        <div className="ss-card" style={{ overflow: "hidden" }}>
          <div className="overflow-x-auto">
            {(() => {
              const hasColor = variants.some((v) => v.color);
              const hasSize = variants.some((v) => v.size);
              return (
            <table className="ss-tbl" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>SKU</th>
                  {hasColor && <th>Color</th>}
                  {hasSize && <th>Size</th>}
                  <th>Barcode</th>
                  {platforms.map((p) => (
                    <th key={p}>{PLATFORM_LABELS[p] ?? p}</th>
                  ))}
                  <th style={{ textAlign: "right" }}>Available</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const available = variant.inventory.reduce(
                    (sum, loc) => sum + getQuantity(loc.quantities, "available"), 0,
                  );
                  const listingByPlatform = new Map(variant.listings.map((l) => [l.platform, l]));
                  return (
                    <tr key={variant.id}>
                      <td className="ss-num" style={{ fontSize: 13, color: "var(--ss-ink-2)" }}>{variant.sku}</td>
                      {hasColor && <td style={{ color: "var(--ss-ink-2)" }}>{variant.color ?? "—"}</td>}
                      {hasSize && <td style={{ color: "var(--ss-ink-2)" }}>{variant.size ?? "—"}</td>}
                      <td className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{variant.barcode ?? "—"}</td>
                      {platforms.map((p) => {
                        const listing = listingByPlatform.get(p);
                        const status = listing?.status ?? "unlisted";
                        return (
                          <td key={p}>
                            <div className="flex flex-col gap-1">
                              <span className={STATUS_BADGE[status] ?? STATUS_BADGE.unlisted}>
                                {status}
                              </span>
                              {p === "amazon_sp" && listing?.qualityScore != null && (
                                <QualityScoreBadge score={listing.qualityScore} />
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmt(available)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Inventory by location */}
      {inventorySummary.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Inventory by Location" />
          <div className="ss-card" style={{ overflow: "hidden" }}>
            <div className="overflow-x-auto">
              <table className="ss-tbl">
                <thead>
                  <tr>
                    <th>Location</th>
                    {QUANTITY_ORDER.map((q) => (
                      <th key={q} className="capitalize" style={{ textAlign: "right" }}>{q.replace("_", " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventorySummary.map((loc) => (
                    <tr key={loc.locationKey}>
                      <td style={{ color: "var(--ss-ink-2)" }}>
                        {loc.name}
                      </td>
                      {QUANTITY_ORDER.map((qName) => (
                        <td key={qName} className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                          {fmt(getQuantity(loc.quantities, qName))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Open alerts */}
      {alerts.length > 0 && (
        <section id="open-issues" className="flex flex-col gap-3">
          <SectionHeader title="Open Issues" count={alerts.length} />
          {alerts.map((alert) => {
            const payload = alert.payloadJson;
            const issues = payload?.issues ?? [];
            const isAmazon = (alert.sourcePlatform ?? "") === "amazon_sp";
            const amazonSkus = isAmazon
              ? variants.flatMap((v) =>
                  v.listings
                    .filter((l) => l.platform === "amazon_sp" && l.platformListingId)
                    .map((l) => ({ variantId: v.id, sku: l.platformListingId! }))
                )
              : [];
            return (
              <div key={alert.id} className="ss-card" style={{ padding: 16 }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={SEVERITY_BADGE[alert.severity] ?? SEVERITY_BADGE.info}>
                        {alert.severity}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                        {PLATFORM_LABELS[alert.sourcePlatform ?? ""] ?? alert.sourcePlatform}
                      </span>
                    </div>
                    {payload?.offer_id && (
                      <p className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>offer: {payload.offer_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{formatDate(alert.createdAt)}</span>
                    <form action={resolveAlert.bind(null, alert.id)}>
                      <button type="submit" className="ss-btn ss-btn-sm">Mark resolved</button>
                    </form>
                  </div>
                </div>
                {issues.length > 0 && (
                  <ul className="mt-3 space-y-3" style={{ borderTop: "1px solid var(--ss-line)", paddingTop: 12 }}>
                    {issues.map((issue, i) => {
                      const body = issue.message ?? issue.description;
                      const attrs = issue.attributeNames?.length
                        ? issue.attributeNames.join(", ")
                        : (issue.attribute ?? null);
                      const hint = issue.resolution
                        ?? (issue.categories?.[0] ? ISSUE_CATEGORY_HINT[issue.categories[0]] : null);
                      const impacts = issue.enforcements?.actions
                        ?.map((a) => a.action ? (ISSUE_ACTION_LABEL[a.action] ?? null) : null)
                        .filter((x): x is string => x !== null) ?? [];
                      const isMissingAttr = issue.categories?.includes("MISSING_ATTRIBUTE") && issue.attributeNames?.length;

                      return (
                        <li key={i} className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: ISSUE_SEV_COLOR[String(issue.severity ?? "").toLowerCase()] ?? "var(--ss-ink-3)" }}>
                              {issue.severity ?? "issue"}
                            </span>
                            {attrs && (
                              <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{attrs}</span>
                            )}
                            {impacts.map((label, j) => (
                              <span key={j} style={{ fontSize: 11, fontWeight: 600, color: "var(--ss-red-ink)", background: "var(--ss-red-soft)", borderRadius: 4, padding: "1px 6px" }}>
                                {label}
                              </span>
                            ))}
                          </div>
                          {body && <p style={{ fontSize: 14, color: "var(--ss-ink-2)" }}>{body}</p>}
                          {hint && !isMissingAttr && (
                            <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>→ {hint}</p>
                          )}
                          {isMissingAttr && amazonSkus.length > 0 && issue.attributeNames?.map((attrName) => (
                            <AmazonAttributeFix
                              key={attrName}
                              productId={product.id}
                              attributeName={attrName}
                              skus={amazonSkus}
                            />
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Search Console */}
      {gsc && (gsc.pages.length > 0 || gsc.queries.length > 0) && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <SectionHeader title={`Search Console — /products/${gsc.handle}`} />
            {gsc.dataSource === "fuzzy" && (
              <span className="ss-pill" style={{ fontSize: 10 }}>fuzzy match · resync for exact data</span>
            )}
          </div>
          {gsc.pages.length > 0 && (
            <div className="ss-card" style={{ overflow: "hidden" }}>
              <CardHeader title="Landing Pages" />
              <div className="overflow-x-auto">
                <table className="ss-tbl">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th style={{ textAlign: "right" }}>Clicks</th>
                      <th style={{ textAlign: "right" }}>Impressions</th>
                      <th style={{ textAlign: "right" }}>CTR</th>
                      <th style={{ textAlign: "right" }}>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.pages.map((row, i) => (
                      <tr key={i}>
                        <td className="ss-num max-w-[280px] truncate" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{row.url}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.clicks}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmt(row.impressions)}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.ctr.toFixed(1)}%</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {gsc.queries.length > 0 && (
            <div className="ss-card" style={{ overflow: "hidden" }}>
              <CardHeader title={`Search Queries${gsc.dataSource === "exact" ? " — exact landing page match" : ""}`} />
              <div className="overflow-x-auto">
                <table className="ss-tbl">
                  <thead>
                    <tr>
                      <th>Query</th>
                      {gsc.dataSource === "exact" && <th>Landing Page</th>}
                      <th style={{ textAlign: "right" }}>Clicks</th>
                      <th style={{ textAlign: "right" }}>Impressions</th>
                      <th style={{ textAlign: "right" }}>CTR</th>
                      <th style={{ textAlign: "right" }}>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.queries.map((row, i) => (
                      <tr key={i}>
                        <td style={{ color: "var(--ss-ink-2)" }}>{row.query}</td>
                        {gsc.dataSource === "exact" && (
                          <td className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-4)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.landingUrl ?? "—"}
                          </td>
                        )}
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.clicks}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmt(row.impressions)}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.ctr.toFixed(1)}%</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <p style={{ fontSize: 12, color: "var(--ss-ink-4)" }}>Last updated {formatDate(product.updatedAt)}</p>
    </div>
  );
}

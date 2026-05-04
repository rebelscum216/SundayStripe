import { notFound } from "next/navigation";
import { resolveAlert } from "../../actions";
import { AmazonListingRewrite } from "./amazon-listing-rewrite";
import { AiDescribeButton } from "./ai-describe";
import { MissingAttributeFix } from "./missing-attribute-fix";
import { ProductFixAssistant } from "./product-fix-assistant";
import { QualityScoreBadge } from "../quality-score-badge";

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
  listings: Listing[];
  inventory: InventoryLocation[];
};
type Issue = {
  code?: string;
  description?: string;
  severity?: string;
  attribute?: string;
  resolution?: string;
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
type GscRow = { url?: string; query?: string; clicks: number; impressions: number; ctr: number; position: number };
type GscData = { handle: string; pages: GscRow[]; queries: GscRow[] };
type ProductDetail = {
  product: {
    id: string;
    title: string | null;
    canonicalSku: string;
    brand: string | null;
    descriptionHtml: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
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
  published:   "border-emerald-700 bg-emerald-950 text-emerald-400",
  issue:       "border-amber-700 bg-amber-950 text-amber-400",
  disapproved: "border-red-700 bg-red-950 text-red-400",
  unlisted:    "border-zinc-700 bg-zinc-800 text-zinc-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  high:     "border-red-700 bg-red-950 text-red-400",
  critical: "border-red-600 bg-red-950 text-red-300",
  info:     "border-zinc-700 bg-zinc-800 text-zinc-400",
};

const ISSUE_SEV_COLOR: Record<string, string> = {
  critical:   "text-red-400",
  error:      "text-orange-400",
  warning:    "text-amber-400",
  suggestion: "text-zinc-500",
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

const SectionHeader = ({ title, count }: { title: string; count?: number }) => (
  <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
    {title}
    {count !== undefined && (
      <span className="font-mono font-normal normal-case tracking-normal text-zinc-600">{count}</span>
    )}
  </h2>
);

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <a href="/products" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Products
        </a>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Product</p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-100 md:text-4xl">
              {product.title ?? product.canonicalSku}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-zinc-500">{product.canonicalSku}</span>
              {product.brand && <span className="text-sm text-zinc-500">{product.brand}</span>}
              <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                source: {product.sourceOfTruth}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-5 text-right">
            <div>
              <p className="text-xs text-zinc-500">Variants</p>
              <p className="font-mono text-2xl font-semibold text-zinc-100">{variants.length}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Available</p>
              <p className="font-mono text-2xl font-semibold text-zinc-100">{fmt(totalAvailable)}</p>
            </div>
            {revenue && revenue.revenueCents > 0 && (
              <div>
                <p className="text-xs text-zinc-500">Revenue (90d)</p>
                <p className="font-mono text-2xl font-semibold text-emerald-400">
                  {currency(revenue.revenueCents)}
                </p>
              </div>
            )}
            {alerts.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500">Open Issues</p>
                <p className="font-mono text-2xl font-semibold text-amber-400">{alerts.length}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Missing attributes */}
      {missingAttributes.length > 0 && (
        <div className="rounded border border-amber-800/60 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-400">
            {missingAttributes.length} missing attribute{missingAttributes.length !== 1 ? "s" : ""}
            <span className="ml-2 font-normal text-amber-500/70">— required for channel listing quality</span>
          </p>
          <ul className="space-y-1">
            {missingAttributes.map((item) => (
              <li
                key={item.attr}
                className="flex flex-col justify-between gap-3 border-t border-amber-900/50 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-start"
              >
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="text-sm font-medium text-amber-300">{item.label}</span>
                  <span className="text-xs text-amber-500/80">{item.detail}</span>
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
          </ul>
        </div>
      )}

      {/* AI Actions */}
      <section id="ai-actions" className="flex flex-col gap-3">
        <SectionHeader title="AI Actions" />
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
          {(product.seoTitle || product.seoDescription) && (
            <div className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Current Shopify SEO
              </p>
              {product.seoTitle && (
                <div>
                  <p className="text-xs text-zinc-500">SEO Title</p>
                  <p className="mt-0.5 text-sm text-zinc-300">{product.seoTitle}</p>
                </div>
              )}
              {product.seoDescription && (
                <div>
                  <p className="text-xs text-zinc-500">SEO Meta Description</p>
                  <p className="mt-0.5 text-sm text-zinc-300">{product.seoDescription}</p>
                </div>
              )}
              <div className="border-t border-zinc-800 pt-3" />
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
          <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-5">
                <div>
                  <p className="text-xs text-zinc-500">Units</p>
                  <p className="font-mono font-semibold text-zinc-100">{fmt(revenue.unitsSold)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Revenue</p>
                  <p className="font-mono font-semibold text-emerald-400">{currency(revenue.revenueCents)}</p>
                </div>
              </div>
            </div>
            {revenue.topVariants.length > 0 && (
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs font-medium text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">Size</th>
                    <th className="px-4 py-2 text-right">Units</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.topVariants.map((v, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">{v.sku}</td>
                      <td className="px-4 py-2 text-zinc-300">{v.size ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-300">{v.unitsSold}</td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-400">{currency(v.revenueCents)}</td>
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
        <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="text-xs font-medium text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Barcode</th>
                  {platforms.map((p) => (
                    <th key={p} className="px-4 py-3">{PLATFORM_LABELS[p] ?? p}</th>
                  ))}
                  <th className="px-4 py-3 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const available = variant.inventory.reduce(
                    (sum, loc) => sum + getQuantity(loc.quantities, "available"), 0,
                  );
                  const listingByPlatform = new Map(variant.listings.map((l) => [l.platform, l]));
                  return (
                    <tr key={variant.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-4 py-3 font-mono text-sm text-zinc-300">{variant.sku}</td>
                      <td className="px-4 py-3 text-zinc-300">{variant.size ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{variant.barcode ?? "—"}</td>
                      {platforms.map((p) => {
                        const listing = listingByPlatform.get(p);
                        const status = listing?.status ?? "unlisted";
                        return (
                          <td key={p} className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.unlisted}`}>
                                {status}
                              </span>
                              {p === "amazon_sp" && listing?.qualityScore != null && (
                                <QualityScoreBadge score={listing.qualityScore} />
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{fmt(available)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Inventory by location */}
      {inventorySummary.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Inventory by Location" />
          <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs font-medium text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3">Location</th>
                    {QUANTITY_ORDER.map((q) => (
                      <th key={q} className="px-4 py-3 text-right capitalize">{q.replace("_", " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventorySummary.map((loc) => (
                    <tr key={loc.locationKey} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-4 py-3 text-sm text-zinc-300">
                        {loc.name}
                      </td>
                      {QUANTITY_ORDER.map((qName) => (
                        <td key={qName} className="px-4 py-3 text-right font-mono text-zinc-300">
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
        <section className="flex flex-col gap-3">
          <SectionHeader title="Open Issues" count={alerts.length} />
          {alerts.map((alert) => {
            const payload = alert.payloadJson;
            const issues = payload?.issues ?? [];
            return (
              <div key={alert.id} className="rounded border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[alert.severity] ?? SEVERITY_BADGE.info}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {PLATFORM_LABELS[alert.sourcePlatform ?? ""] ?? alert.sourcePlatform}
                      </span>
                    </div>
                    {payload?.offer_id && (
                      <p className="font-mono text-xs text-zinc-500">offer: {payload.offer_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-500">{formatDate(alert.createdAt)}</span>
                    <form action={resolveAlert.bind(null, alert.id)}>
                      <button
                        type="submit"
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
                {issues.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                    {issues.map((issue, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold uppercase tracking-wide ${ISSUE_SEV_COLOR[String(issue.severity ?? "").toLowerCase()] ?? "text-zinc-400"}`}>
                            {issue.severity ?? "issue"}
                          </span>
                          {issue.attribute && (
                            <span className="font-mono text-xs text-zinc-500">{issue.attribute}</span>
                          )}
                        </div>
                        {issue.description && <p className="text-sm text-zinc-300">{issue.description}</p>}
                        {issue.resolution && <p className="text-xs text-zinc-500">{issue.resolution}</p>}
                      </li>
                    ))}
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
          <SectionHeader title={`Search Console — /products/${gsc.handle}`} />
          {gsc.pages.length > 0 && (
            <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Landing Pages</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs font-medium text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-2">Page</th>
                      <th className="px-4 py-2 text-right">Clicks</th>
                      <th className="px-4 py-2 text-right">Impressions</th>
                      <th className="px-4 py-2 text-right">CTR</th>
                      <th className="px-4 py-2 text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.pages.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                        <td className="max-w-[280px] truncate px-4 py-2 font-mono text-xs text-zinc-400">{row.url}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.clicks}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{fmt(row.impressions)}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.ctr.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {gsc.queries.length > 0 && (
            <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Search Queries</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs font-medium text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-2">Query</th>
                      <th className="px-4 py-2 text-right">Clicks</th>
                      <th className="px-4 py-2 text-right">Impressions</th>
                      <th className="px-4 py-2 text-right">CTR</th>
                      <th className="px-4 py-2 text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.queries.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                        <td className="px-4 py-2 text-zinc-300">{row.query}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.clicks}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{fmt(row.impressions)}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.ctr.toFixed(1)}%</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{row.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-zinc-600">Last updated {formatDate(product.updatedAt)}</p>
    </div>
  );
}

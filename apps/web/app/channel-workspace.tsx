import Link from "next/link";
import { importAmazonListing } from "./actions";
import { ChannelBadge } from "./components/channel-badge";
import { MetricCard } from "./components/metric-card";
import { PageHeader } from "./components/page-header";
import { StatusPill } from "./components/status-pill";
import { QualityScoreBadge } from "./products/quality-score-badge";

type Platform = "shopify" | "merchant" | "amazon_sp";
type Product = {
  id: string;
  title: string | null;
  canonicalSku: string;
  variantCount: number;
  availableInventory: number;
  missingAttributes: string[];
  amazonQualityScore: number | null;
  channels: Array<{ platform: string; status: string }>;
};
type IntegrationStatus = {
  platform: string;
  status: string;
  last_synced_at?: string | null;
  lastSyncedAt?: string | null;
  pending_jobs?: number;
  pendingJobs?: number;
  failed_jobs?: number;
  failedJobs?: number;
  open_alerts?: number;
  openAlerts?: number;
};
type AmazonUnmatchedListing = {
  sku: string;
  asin: string | null;
  title: string | null;
  status: string;
  productType: string | null;
  imageUrl: string | null;
};
type AmazonUnmatchedResponse = {
  fetchedListings: number;
  unmatchedCount: number;
  items: AmazonUnmatchedListing[];
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

const ATTR_LABELS: Record<string, string> = {
  title: "Title",
  brand: "Brand",
  barcode: "Barcode / GTIN",
  description: "Description",
};

const PLATFORM_GAPS: Record<Platform, string[]> = {
  shopify: ["title", "brand", "description"],
  merchant: ["title", "brand", "barcode", "description"],
  amazon_sp: ["title", "brand", "barcode", "description"],
};

const STATUS_CLASS: Record<string, string> = {
  published: "ss-pill ss-pill-sage",
  active: "ss-pill ss-pill-sage",
  issue: "ss-pill ss-pill-amber",
  disapproved: "ss-pill ss-pill-red",
  missing: "ss-pill ss-pill-amber",
  unlisted: "ss-pill",
};

async function getProducts() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/products`, { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as Product[];
  } catch {
    return [];
  }
}

async function getStatus() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/status`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { integrations?: IntegrationStatus[] };
    return data.integrations ?? [];
  } catch {
    return [];
  }
}

async function getAmazonUnmatchedListings() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/amazon/unmatched`, { cache: "no-store" });
    if (!response.ok) return { fetchedListings: 0, unmatchedCount: 0, items: [] };
    return (await response.json()) as AmazonUnmatchedResponse;
  } catch {
    return { fetchedListings: 0, unmatchedCount: 0, items: [] };
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  let hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${month} ${date.getDate()}, ${date.getFullYear()}, ${hour}:${minute} ${period}`;
}

function statusToPill(status: string, pendingJobs: number): "active" | "syncing" | "error" | "idle" | "missing" {
  if (pendingJobs > 0) return "syncing";
  if (status === "active") return "active";
  if (status === "error") return "error";
  if (status === "syncing") return "syncing";
  return "idle";
}

function listingStatus(product: Product, platform: Platform) {
  return product.channels.find((channel) => channel.platform === platform)?.status ?? "missing";
}

function productHasIssue(product: Product, platform: Platform) {
  const status = listingStatus(product, platform);
  if (status === "missing") return false;
  if (status === "issue" || status === "disapproved" || status === "unlisted") return true;
  if (platform === "amazon_sp" && product.amazonQualityScore !== null && product.amazonQualityScore < 50) return true;
  return product.missingAttributes.some((attr) => PLATFORM_GAPS[platform].includes(attr));
}

function gapHref(platform: Platform) {
  if (platform === "amazon_sp") return "/products?gap=amazon_sp";
  if (platform === "merchant") return "/products?gap=merchant";
  return "/products";
}

function AmazonListingArtwork({ listing }: { listing: AmazonUnmatchedListing }) {
  return listing.imageUrl ? (
    <img
      src={listing.imageUrl}
      alt=""
      className="h-12 w-12 object-cover"
      style={{ borderRadius: 7, border: "1px solid var(--ss-line)", background: "var(--ss-bg-elev)" }}
    />
  ) : (
    <div className="h-12 w-12" style={{ borderRadius: 7, border: "1px solid var(--ss-line)", background: "var(--ss-bg-elev)" }} />
  );
}

function AmazonUnmatchedListings({
  amazonUnmatched,
}: {
  amazonUnmatched: AmazonUnmatchedResponse;
}) {
  return (
    <section className="ss-card" style={{ overflow: "hidden", borderColor: "var(--ss-amber-soft)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>Unmatched Amazon listings</h2>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>
            Click a listing to inspect details, suggested fixes, and import options.
          </p>
        </div>
        <div className="ss-num" style={{ textAlign: "right", fontSize: 12, color: "var(--ss-ink-3)" }}>
          <div>{formatNumber(amazonUnmatched.unmatchedCount)} unmatched</div>
          <div>{formatNumber(amazonUnmatched.fetchedListings)} fetched live</div>
        </div>
      </div>

      <div>
        {amazonUnmatched.items.slice(0, 50).map((listing, index) => (
          <details
            key={listing.sku}
            style={{
              borderTop: index === 0 ? "0" : "1px solid var(--ss-line)",
              background: "var(--ss-bg-card)",
            }}
          >
            <summary
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(320px, 1fr) 180px 140px 90px",
                alignItems: "center",
                gap: 16,
                padding: "12px 16px",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <AmazonListingArtwork listing={listing} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--ss-ink)" }}>
                    {listing.title ?? listing.sku}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--ss-amber-ink)" }}>Needs product link/import</div>
                </div>
              </div>
              <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>{listing.sku}</span>
              <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{listing.asin ?? "-"}</span>
              <span className="ss-pill">Details</span>
            </summary>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                padding: "0 16px 16px 80px",
              }}
            >
              <div className="ss-card" style={{ padding: 14, background: "var(--ss-bg-elev)" }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)" }}>
                  Listing details
                </h3>
                <dl style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 12px", marginTop: 12, fontSize: 13 }}>
                  <dt style={{ color: "var(--ss-ink-3)" }}>Seller SKU</dt>
                  <dd className="ss-num" style={{ color: "var(--ss-ink)" }}>{listing.sku}</dd>
                  <dt style={{ color: "var(--ss-ink-3)" }}>ASIN</dt>
                  <dd className="ss-num" style={{ color: "var(--ss-ink)" }}>{listing.asin ?? "Not provided"}</dd>
                  <dt style={{ color: "var(--ss-ink-3)" }}>Type</dt>
                  <dd style={{ color: "var(--ss-ink)" }}>{listing.productType ?? "Unknown"}</dd>
                  <dt style={{ color: "var(--ss-ink-3)" }}>Status</dt>
                  <dd><span className={STATUS_CLASS[listing.status.toLowerCase()] ?? STATUS_CLASS.unlisted}>{listing.status}</span></dd>
                </dl>
              </div>

              <div className="ss-card" style={{ padding: 14, borderColor: "var(--ss-amber-soft)", background: "color-mix(in oklab, var(--ss-amber-soft) 20%, var(--ss-bg-card))" }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-amber-ink)" }}>
                  Suggestions
                </h3>
                <ul style={{ marginTop: 10, paddingLeft: 18, color: "var(--ss-ink-2)", fontSize: 13, lineHeight: 1.6 }}>
                  <li>Match this Amazon seller SKU to an existing Shopify variant SKU when possible.</li>
                  <li>Verify the ASIN and product type before importing, especially for apparel variants.</li>
                  <li>Import only if this listing should become a local catalog product.</li>
                </ul>
                <form action={importAmazonListing.bind(null, listing)} style={{ marginTop: 14 }}>
                  <button type="submit" className="ss-btn ss-btn-sm ss-btn-primary">
                    Import listing
                  </button>
                </form>
              </div>
            </div>
          </details>
        ))}
      </div>

      {amazonUnmatched.items.length > 50 && (
        <div style={{ borderTop: "1px solid var(--ss-line)", padding: "12px 16px", fontSize: 12, color: "var(--ss-ink-3)" }}>
          Showing first 50 unmatched listings.
        </div>
      )}
    </section>
  );
}

export async function ChannelWorkspace({
  platform,
  title,
  meta,
}: {
  platform: Platform;
  title: string;
  meta: string;
}) {
  const [products, statuses, amazonUnmatched] = await Promise.all([
    getProducts(),
    getStatus(),
    platform === "amazon_sp"
      ? getAmazonUnmatchedListings()
      : Promise.resolve({ fetchedListings: 0, unmatchedCount: 0, items: [] }),
  ]);
  const integration = statuses.find((status) => status.platform === platform);
  const pendingJobs = integration?.pendingJobs ?? integration?.pending_jobs ?? 0;
  const failedJobs = integration?.failedJobs ?? integration?.failed_jobs ?? 0;
  const openAlerts = integration?.openAlerts ?? integration?.open_alerts ?? 0;
  const listedProducts = products.filter((product) => listingStatus(product, platform) !== "missing");
  const notListedProducts = products.filter((product) => listingStatus(product, platform) === "missing");
  const issueProducts = listedProducts.filter((product) => productHasIssue(product, platform));
  const listedRows = issueProducts.length > 0 ? issueProducts : listedProducts.slice(0, 20);
  const listedTitle = issueProducts.length > 0 ? "Listings to Fix" : "Listed Products";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Channel" title={title} meta={meta} />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Listed products" value={formatNumber(listedProducts.length)} sub={`${formatNumber(products.length)} total products`} />
        <MetricCard label="Needs attention" value={formatNumber(issueProducts.length)} accent={issueProducts.length > 0 ? "warn" : "good"} sub="Listings, attributes, or quality" />
        <MetricCard
          label={platform === "amazon_sp" ? "Unmatched Amazon" : "Not listed"}
          value={formatNumber(platform === "amazon_sp" ? amazonUnmatched.unmatchedCount : notListedProducts.length)}
          accent={(platform === "amazon_sp" ? amazonUnmatched.unmatchedCount : notListedProducts.length) > 0 ? "warn" : "good"}
          sub={platform === "amazon_sp" ? `${formatNumber(notListedProducts.length)} catalog products not linked` : undefined}
        />
        <MetricCard label="Open alerts" value={formatNumber(openAlerts)} accent={openAlerts > 0 ? "bad" : "good"} sub={`${formatNumber(failedJobs)} failed jobs`} />
      </div>

      <section className="ss-card" style={{ padding: 16 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge platform={platform} />
            <StatusPill
              status={integration ? statusToPill(integration.status, pendingJobs) : "missing"}
              label={integration ? undefined : "Missing"}
            />
            <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
              Last sync {formatDate(integration?.lastSyncedAt ?? integration?.last_synced_at)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/operations"
              className="ss-btn ss-btn-sm ss-btn-primary"
            >
              Sync channel
            </Link>
            <Link
              href={gapHref(platform)}
              className="ss-btn ss-btn-sm"
            >
              Review products
            </Link>
          </div>
        </div>
      </section>

      {/* Listed products */}
      <section className="ss-card" style={{ overflow: "hidden" }}>
        <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>{listedTitle}</h2>
          <span className="ss-pill">{formatNumber(listedRows.length)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ss-tbl" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Variants</th>
                <th style={{ textAlign: "right" }}>Inventory</th>
                {platform === "amazon_sp" && <th>Amazon Score</th>}
                <th>Gaps</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {listedRows.map((product) => {
                const status = listingStatus(product, platform);
                const gaps = product.missingAttributes.filter((attr) => PLATFORM_GAPS[platform].includes(attr));
                return (
                  <tr key={product.id}>
                    <td>
                      <Link href={`/products/${product.id}`} style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}>
                        {product.title ?? product.canonicalSku}
                      </Link>
                      <p className="ss-num" style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>{product.canonicalSku}</p>
                    </td>
                    <td>
                      <span className={STATUS_CLASS[status] ?? STATUS_CLASS.unlisted}>
                        {status}
                      </span>
                    </td>
                    <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(product.variantCount)}</td>
                    <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(product.availableInventory)}</td>
                    {platform === "amazon_sp" && (
                      <td>
                        {product.amazonQualityScore !== null ? (
                          <QualityScoreBadge score={product.amazonQualityScore} />
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>-</span>
                        )}
                      </td>
                    )}
                    <td>
                      {gaps.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {gaps.map((gap) => (
                            <span key={gap} className="ss-pill ss-pill-amber">
                              {ATTR_LABELS[gap] ?? gap}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/products/${product.id}`}
                        className="ss-btn ss-btn-sm"
                      >
                        Fix
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {listedRows.length === 0 && (
                <tr>
                  <td style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)" }} colSpan={platform === "amazon_sp" ? 7 : 6}>
                    No listed products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {platform === "amazon_sp" && amazonUnmatched.items.length > 0 && (
        <AmazonUnmatchedListings amazonUnmatched={amazonUnmatched} />
      )}

      {/* Not listed */}
      {notListedProducts.length > 0 && (
        <section className="ss-card" style={{ overflow: "hidden" }}>
          <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>Not on {title}</h2>
              <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>Products in your catalog with no {title} listing</p>
            </div>
            <span className="ss-pill">{formatNumber(notListedProducts.length)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ss-tbl" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Variants</th>
                  <th style={{ textAlign: "right" }}>Inventory</th>
                  <th>Gaps to fix first</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {notListedProducts.map((product) => {
                  const gaps = product.missingAttributes.filter((attr) => PLATFORM_GAPS[platform].includes(attr));
                  return (
                    <tr key={product.id}>
                      <td>
                        <Link href={`/products/${product.id}`} style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}>
                          {product.title ?? product.canonicalSku}
                        </Link>
                        <p className="ss-num" style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>{product.canonicalSku}</p>
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(product.variantCount)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(product.availableInventory)}</td>
                      <td>
                        {gaps.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {gaps.map((gap) => (
                              <span key={gap} className="ss-pill ss-pill-amber">
                                {ATTR_LABELS[gap] ?? gap}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Ready to list</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/products/${product.id}`}
                          className="ss-btn ss-btn-sm"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

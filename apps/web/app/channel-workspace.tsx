import Link from "next/link";
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

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

const ATTR_LABELS: Record<string, string> = {
  title: "Title",
  brand: "Brand",
  barcode: "Barcode / GTIN",
  description: "Description",
  seo_title: "SEO title",
};

const PLATFORM_GAPS: Record<Platform, string[]> = {
  shopify: ["title", "brand", "description", "seo_title"],
  merchant: ["title", "brand", "barcode", "description"],
  amazon_sp: ["title", "brand", "barcode", "description"],
};

const STATUS_CLASS: Record<string, string> = {
  published: "border-emerald-500 bg-emerald-950 text-emerald-400",
  active: "border-emerald-500 bg-emerald-950 text-emerald-400",
  issue: "border-amber-500 bg-amber-950 text-amber-400",
  disapproved: "border-red-500 bg-red-950 text-red-400",
  unlisted: "border-zinc-700 bg-zinc-900 text-zinc-400",
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
  if (status === "missing" || status === "issue" || status === "disapproved" || status === "unlisted") {
    return true;
  }
  if (platform === "amazon_sp" && product.amazonQualityScore !== null && product.amazonQualityScore < 50) {
    return true;
  }
  return product.missingAttributes.some((attr) => PLATFORM_GAPS[platform].includes(attr));
}

function gapHref(platform: Platform) {
  if (platform === "amazon_sp") return "/products?gap=amazon_sp";
  if (platform === "merchant") return "/products?gap=merchant";
  return "/products";
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
  const [products, statuses] = await Promise.all([getProducts(), getStatus()]);
  const integration = statuses.find((status) => status.platform === platform);
  const pendingJobs = integration?.pendingJobs ?? integration?.pending_jobs ?? 0;
  const failedJobs = integration?.failedJobs ?? integration?.failed_jobs ?? 0;
  const openAlerts = integration?.openAlerts ?? integration?.open_alerts ?? 0;
  const listedProducts = products.filter((product) => listingStatus(product, platform) !== "missing");
  const missingProducts = products.length - listedProducts.length;
  const issueProducts = products.filter((product) => productHasIssue(product, platform));
  const rows = issueProducts.length > 0 ? issueProducts : listedProducts.slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Channel" title={title} meta={meta} />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Listed products" value={formatNumber(listedProducts.length)} sub={`${formatNumber(products.length)} total products`} />
        <MetricCard label="Needs attention" value={formatNumber(issueProducts.length)} accent={issueProducts.length > 0 ? "warn" : "good"} sub="Listings, attributes, or quality" />
        <MetricCard label="Missing listings" value={formatNumber(missingProducts)} accent={missingProducts > 0 ? "warn" : "good"} />
        <MetricCard label="Open alerts" value={formatNumber(openAlerts)} accent={openAlerts > 0 ? "bad" : "good"} sub={`${formatNumber(failedJobs)} failed jobs`} />
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge platform={platform} />
            <StatusPill
              status={integration ? statusToPill(integration.status, pendingJobs) : "missing"}
              label={integration ? undefined : "Missing"}
            />
            <span className="font-mono text-xs text-zinc-500">
              Last sync {formatDate(integration?.lastSyncedAt ?? integration?.last_synced_at)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/operations"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              Sync channel
            </Link>
            <Link
              href={gapHref(platform)}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Review products
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            {issueProducts.length > 0 ? "Listings to Fix" : "Recent Listings"}
          </h2>
          <span className="font-mono text-xs text-zinc-500">{formatNumber(rows.length)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Variants</th>
                <th className="px-4 py-3 text-right">Inventory</th>
                {platform === "amazon_sp" && <th className="px-4 py-3">Amazon Score</th>}
                <th className="px-4 py-3">Gaps</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => {
                const status = listingStatus(product, platform);
                const gaps = product.missingAttributes.filter((attr) => PLATFORM_GAPS[platform].includes(attr));
                return (
                  <tr key={product.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <Link href={`/products/${product.id}`} className="font-medium text-zinc-100 hover:underline">
                        {product.title ?? product.canonicalSku}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{product.canonicalSku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? STATUS_CLASS.unlisted}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(product.variantCount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(product.availableInventory)}</td>
                    {platform === "amazon_sp" && (
                      <td className="px-4 py-3">
                        {product.amazonQualityScore !== null ? (
                          <QualityScoreBadge score={product.amazonQualityScore} />
                        ) : (
                          <span className="text-xs text-zinc-500">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {gaps.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {gaps.map((gap) => (
                            <span key={gap} className="rounded border border-amber-500 bg-amber-950 px-1.5 py-0.5 text-xs text-amber-400">
                              {ATTR_LABELS[gap] ?? gap}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/products/${product.id}`}
                        className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                      >
                        Fix
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-zinc-500" colSpan={platform === "amazon_sp" ? 7 : 6}>
                    No products found for this channel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

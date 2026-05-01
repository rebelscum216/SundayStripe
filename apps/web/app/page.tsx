import Link from "next/link";
import { AutoRefresh } from "./auto-refresh";
import { MetricCard } from "./components/metric-card";
import { PageHeader } from "./components/page-header";
import { StatusPill } from "./components/status-pill";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

type IntegrationStatus = {
  id: string;
  platform: string;
  shop_domain: string | null;
  status: string;
  last_synced_at: string | null;
  product_count: number;
  variant_count: number;
  pending_jobs: number;
  failed_jobs: number;
  open_alerts: number;
};
type StatusResponse = { ok: boolean; integrations: IntegrationStatus[] };

type Alert = {
  id: string;
  severity: string;
  category: string;
  sourcePlatform: string | null;
  entityRef: string | null;
  payloadJson: { title?: string; merchant_product_name?: string; offer_id?: string } | null;
  status: string;
  createdAt: string;
};

type CrossChannelRow = {
  productId: string;
  title: string | null;
  canonicalSku: string;
  revenueCents: number;
  unitsSold: number;
  gscImpressions: number;
  channels: string[];
  amazonQualityScore: number | null;
  flag: "no_revenue" | "opportunity" | "no_listing" | "ok";
};

type GscSummary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type InventoryVariant = {
  productId: string;
  title: string | null;
  canonicalSku: string;
  variantId: string;
  sku: string;
  size: string | null;
  available: number;
  unitsSold: number;
  revenueCents: number;
  daysOfCover: number | null;
  status: "out_of_stock" | "stock_risk" | "low_stock" | "ok";
};

type InventoryResponse = {
  periodDays: number;
  totals: {
    variantCount: number;
    totalAvailable: number;
    unitsSold: number;
    revenueCents: number;
    lowStockCount: number;
    stockRiskCount: number;
    outOfStockCount: number;
  };
  variants: InventoryVariant[];
};

type PriorityItem = {
  id: string;
  rank: number;
  label: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "bad" | "warn" | "blue";
};

async function getStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/status`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}

async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Alert[];
  } catch {
    return [];
  }
}

async function getCrossChannel(): Promise<CrossChannelRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/cross-channel`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as CrossChannelRow[];
  } catch {
    return [];
  }
}

async function getGsc(): Promise<GscSummary | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/summary`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as GscSummary;
  } catch {
    return null;
  }
}

async function getInventory(): Promise<InventoryResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/inventory`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as InventoryResponse;
  } catch {
    return null;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  search_console: "Search Console",
  amazon_sp: "Amazon",
};

const PLATFORM_HREFS: Record<string, string> = {
  shopify: "/shopify",
  merchant: "/merchant",
  search_console: "/search-console",
  amazon_sp: "/amazon",
};

const CATEGORY_LABELS: Record<string, string> = {
  listing_issue: "Listing issue",
  sync_lag: "Sync failure",
  inventory_drift: "Inventory drift",
  connector_error: "Connector error",
};

const FLAG_META: Record<CrossChannelRow["flag"], { label: string; className: string; href: string }> = {
  no_revenue: {
    label: "Traffic not converting",
    className: "border-red-800 bg-red-950/40 text-red-400",
    href: "/cross-channel",
  },
  opportunity: {
    label: "Expand to Amazon",
    className: "border-amber-800 bg-amber-950/40 text-amber-400",
    href: "/cross-channel",
  },
  no_listing: {
    label: "Missing Merchant",
    className: "border-blue-800 bg-blue-950/40 text-blue-400",
    href: "/cross-channel",
  },
  ok: {
    label: "OK",
    className: "border-emerald-800 bg-emerald-950/40 text-emerald-400",
    href: "/cross-channel",
  },
};

const PRIORITY_TONE: Record<PriorityItem["tone"], string> = {
  bad: "border-red-800 bg-red-950/30 text-red-400",
  warn: "border-amber-800 bg-amber-950/30 text-amber-400",
  blue: "border-blue-800 bg-blue-950/30 text-blue-400",
};

function fmt(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function currency(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function integrationStatus(integration: IntegrationStatus): "active" | "syncing" | "error" | "idle" {
  if (integration.status === "error" || integration.failed_jobs > 0) return "error";
  if (integration.pending_jobs > 0) return "syncing";
  if (integration.status === "active") return "active";
  return "idle";
}

function alertTitle(alert: Alert) {
  return (
    alert.payloadJson?.title ??
    alert.payloadJson?.merchant_product_name ??
    alert.payloadJson?.offer_id ??
    alert.entityRef ??
    "Unknown alert"
  );
}

function getAiNextBestAction(priorityItems: PriorityItem[]) {
  const top = priorityItems[0];
  if (!top) {
    return {
      title: "No urgent action",
      detail: "Core systems are quiet. Review cross-channel opportunities for growth work.",
      href: "/cross-channel",
      action: "Review opportunities",
    };
  }

  return {
    title: top.title,
    detail: top.detail,
    href: top.href,
    action: top.action,
  };
}

export default async function CommandCenterPage() {
  const [status, alerts, crossChannel, gsc, inventory] = await Promise.all([
    getStatus(),
    getAlerts(),
    getCrossChannel(),
    getGsc(),
    getInventory(),
  ]);

  const integrations = status?.integrations ?? [];
  const totals = integrations.reduce(
    (acc, integration) => ({
      products: Math.max(acc.products, integration.product_count),
      variants: Math.max(acc.variants, integration.variant_count),
      pendingJobs: acc.pendingJobs + integration.pending_jobs,
      failedJobs: acc.failedJobs + integration.failed_jobs,
      openAlerts: acc.openAlerts + integration.open_alerts,
    }),
    { products: 0, variants: 0, pendingJobs: 0, failedJobs: 0, openAlerts: 0 },
  );

  const inventoryTotals = inventory?.totals;
  const riskVariants = (inventory?.variants ?? []).filter((variant) => variant.status !== "ok");
  const revenueAtRisk = riskVariants.reduce((sum, variant) => sum + variant.revenueCents, 0);
  const actionableOps = crossChannel.filter((row) => row.flag !== "ok");
  const priorityAlerts = alerts.filter((alert) => alert.severity === "critical" || alert.severity === "high");

  const priorityItems: PriorityItem[] = [
    ...integrations
      .filter((integration) => integration.failed_jobs > 0)
      .map((integration) => ({
        id: `failed-${integration.id}`,
        rank: 100 + integration.failed_jobs,
        label: "Sync failure",
        title: `${PLATFORM_LABELS[integration.platform] ?? integration.platform} has ${integration.failed_jobs} failed job${integration.failed_jobs !== 1 ? "s" : ""}`,
        detail: "Clear or retry failed jobs so downstream channel data stays fresh.",
        href: "/operations",
        action: "Open operations",
        tone: "bad" as const,
      })),
    ...priorityAlerts.slice(0, 4).map((alert) => ({
      id: `alert-${alert.id}`,
      rank: alert.severity === "critical" ? 90 : 80,
      label: CATEGORY_LABELS[alert.category] ?? alert.category,
      title: alertTitle(alert),
      detail: `${PLATFORM_LABELS[alert.sourcePlatform ?? ""] ?? alert.sourcePlatform ?? "Channel"} needs review.`,
      href: "/alerts",
      action: "Review alert",
      tone: alert.severity === "critical" ? ("bad" as const) : ("warn" as const),
    })),
    ...riskVariants.slice(0, 4).map((variant) => ({
      id: `stock-${variant.variantId}`,
      rank: variant.status === "out_of_stock" ? 70 : 60,
      label: variant.status === "out_of_stock" ? "Out of stock" : "Inventory risk",
      title: variant.title ?? variant.canonicalSku,
      detail: `${variant.sku} has ${fmt(variant.available)} available, ${fmt(variant.unitsSold)} sold in 90 days.`,
      href: `/products/${variant.productId}`,
      action: "Open product",
      tone: variant.status === "out_of_stock" ? ("bad" as const) : ("warn" as const),
    })),
    ...actionableOps.slice(0, 3).map((row) => ({
      id: `opportunity-${row.productId}-${row.flag}`,
      rank: 40,
      label: FLAG_META[row.flag].label,
      title: row.title ?? row.canonicalSku,
      detail: `${currency(row.revenueCents)} revenue, ${fmt(row.gscImpressions)} GSC impressions.`,
      href: "/cross-channel",
      action: "Analyze",
      tone: "blue" as const,
    })),
  ]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 7);

  const aiAction = getAiNextBestAction(priorityItems);

  const flagCounts = crossChannel.reduce<Record<CrossChannelRow["flag"], number>>(
    (acc, row) => {
      acc[row.flag] += 1;
      return acc;
    },
    { no_revenue: 0, opportunity: 0, no_listing: 0, ok: 0 },
  );

  return (
    <>
      <AutoRefresh intervalMs={30_000} />
      <div className="flex flex-col gap-6">
        <PageHeader section="Commerce Hub" title="Command Center" meta="Live operating cockpit" />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricCard
            label="Revenue tracked"
            value={currency(inventoryTotals?.revenueCents ?? 0)}
            sub={`${fmt(inventoryTotals?.unitsSold ?? 0)} units / 90d`}
            accent={(inventoryTotals?.revenueCents ?? 0) > 0 ? "good" : "default"}
          />
          <MetricCard
            label="Revenue at risk"
            value={currency(revenueAtRisk)}
            sub={`${fmt(riskVariants.length)} variants`}
            accent={revenueAtRisk > 0 || riskVariants.length > 0 ? "warn" : "good"}
          />
          <MetricCard
            label="Open alerts"
            value={fmt(alerts.length)}
            sub={`${fmt(priorityAlerts.length)} high priority`}
            accent={alerts.length > 0 ? "warn" : "good"}
          />
          <MetricCard
            label="Failed jobs"
            value={fmt(totals.failedJobs)}
            sub={`${fmt(totals.pendingJobs)} pending`}
            accent={totals.failedJobs > 0 ? "bad" : totals.pendingJobs > 0 ? "warn" : "good"}
          />
          <MetricCard
            label="Opportunities"
            value={fmt(actionableOps.length)}
            sub={`${fmt(flagCounts.opportunity)} Amazon expansion`}
            accent={actionableOps.length > 0 ? "warn" : "good"}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Today's Priority Stack</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">Ranked by sync risk, alert severity, stock risk, and growth upside.</p>
                </div>
                <Link href="/alerts" className="text-xs text-zinc-400 hover:text-zinc-200">
                  Triage alerts
                </Link>
              </div>
              {priorityItems.length === 0 ? (
                <p className="px-4 py-8 text-sm text-zinc-500">No urgent work found. Channel data is quiet.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {priorityItems.map((item, index) => (
                    <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[28px_140px_minmax(0,1fr)_120px] md:items-center">
                      <div className="font-mono text-xs text-zinc-500">{index + 1}</div>
                      <span className={`w-fit rounded border px-2 py-0.5 text-xs font-medium ${PRIORITY_TONE[item.tone]}`}>
                        {item.label}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{item.detail}</p>
                      </div>
                      <Link href={item.href} className="rounded border border-zinc-700 px-3 py-1.5 text-center text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                        {item.action}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Revenue At Risk</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">Fast-moving or unavailable variants from live inventory and 90-day sales.</p>
                </div>
                <Link href="/inventory" className="text-xs text-zinc-400 hover:text-zinc-200">
                  Open inventory
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Variant</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Available</th>
                      <th className="px-4 py-3 text-right">Sold 90d</th>
                      <th className="px-4 py-3 text-right">Days Cover</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(riskVariants.length > 0 ? riskVariants : (inventory?.variants ?? []).slice(0, 5)).slice(0, 8).map((variant) => (
                      <tr key={variant.variantId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                        <td className="px-4 py-3">
                          <Link href={`/products/${variant.productId}`} className="font-medium text-zinc-100 hover:underline">
                            {variant.title ?? variant.canonicalSku}
                          </Link>
                          <p className="mt-1 font-mono text-xs text-zinc-500">{variant.sku}{variant.size ? ` · ${variant.size}` : ""}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${
                            variant.status === "out_of_stock"
                              ? "border-red-500 bg-red-950 text-red-400"
                              : variant.status === "ok"
                                ? "border-emerald-500 bg-emerald-950 text-emerald-400"
                                : "border-amber-500 bg-amber-950 text-amber-400"
                          }`}>
                            {variant.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${variant.available <= 0 ? "text-red-400" : "text-zinc-300"}`}>{fmt(variant.available)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{fmt(variant.unitsSold)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{variant.daysOfCover === null ? "-" : variant.daysOfCover}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{currency(variant.revenueCents)}</td>
                      </tr>
                    ))}
                    {(inventory?.variants ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                          No inventory data found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">Cross-Channel Opportunity Preview</h2>
                <Link href="/cross-channel" className="text-xs text-zinc-400 hover:text-zinc-200">
                  View board
                </Link>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-4">
                {(["no_revenue", "opportunity", "no_listing", "ok"] as const).map((flag) => {
                  const meta = FLAG_META[flag];
                  return (
                    <Link key={flag} href={meta.href} className={`rounded border px-3 py-3 ${meta.className}`}>
                      <p className="text-xs font-medium">{meta.label}</p>
                      <p className="mt-2 font-mono text-2xl font-semibold">{fmt(flagCounts[flag])}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded border border-blue-800 bg-blue-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">AI Next Best Action</p>
              <h2 className="mt-3 text-lg font-semibold text-zinc-100">{aiAction.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{aiAction.detail}</p>
              <Link href={aiAction.href} className="mt-4 inline-flex rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
                {aiAction.action}
              </Link>
            </section>

            <section className="rounded border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">Channel Health</h2>
                <Link href="/operations" className="text-xs text-zinc-400 hover:text-zinc-200">
                  Operations
                </Link>
              </div>
              <div className="divide-y divide-zinc-800">
                {integrations.map((integration) => (
                  <Link
                    key={integration.id}
                    href={PLATFORM_HREFS[integration.platform] ?? "/operations"}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{PLATFORM_LABELS[integration.platform] ?? integration.platform}</p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">{relativeTime(integration.last_synced_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {integration.open_alerts > 0 && (
                        <span className="font-mono text-xs text-amber-400">{integration.open_alerts}</span>
                      )}
                      <StatusPill status={integrationStatus(integration)} />
                    </div>
                  </Link>
                ))}
                {integrations.length === 0 && (
                  <p className="px-4 py-6 text-sm text-zinc-500">No integrations connected.</p>
                )}
              </div>
            </section>

            <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Freshness</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">API</span>
                  <StatusPill status={status?.ok ? "active" : "error"} label={status?.ok ? "Online" : "Offline"} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">Products</span>
                  <span className="font-mono text-xs text-zinc-500">{fmt(totals.products)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">Variants</span>
                  <span className="font-mono text-xs text-zinc-500">{fmt(totals.variants)}</span>
                </div>
                {gsc && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300">GSC impressions</span>
                    <span className="font-mono text-xs text-zinc-500">{fmt(gsc.impressions)}</span>
                  </div>
                )}
              </div>
              {totals.failedJobs > 0 && (
                <p className="mt-3 text-xs text-red-400">
                  Failed jobs need cleanup in <Link href="/operations" className="underline hover:text-red-300">Operations</Link>.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { AutoRefresh } from "./auto-refresh";
import { TopbarSearch } from "./components/topbar-search";
import { CardSkeleton, SectionSkeleton } from "./components/skeleton";
import { StatusPill } from "./components/status-pill";
import { AiFeed } from "./components/ai-feed";
import { AlmostPage1Table, type AlmostPage1Row } from "./search-console/almost-page-1-table";
import { LowCtrTable } from "./search-console/low-ctr-table";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

// ─── Types ───────────────────────────────────────────────────────────────────

type IntegrationStatus = {
  id: string; platform: string; shop_domain: string | null; status: string;
  last_synced_at: string | null; product_count: number; variant_count: number;
  pending_jobs: number; failed_jobs: number; open_alerts: number;
};
type StatusResponse = { ok: boolean; integrations: IntegrationStatus[] };

type Alert = {
  id: string; severity: string; category: string; sourcePlatform: string | null;
  entityRef: string | null;
  payloadJson: { title?: string; merchant_product_name?: string; offer_id?: string; [key: string]: unknown } | null;
  status: string; createdAt: string;
};

type CrossChannelRow = {
  productId: string; title: string | null; canonicalSku: string;
  revenueCents: number; unitsSold: number; gscImpressions: number;
  channels: string[]; amazonQualityScore: number | null;
  flag: "no_revenue" | "opportunity" | "no_listing" | "ok";
};

type GscSummary = { clicks: number; impressions: number; ctr: number; position: number };

type InventoryVariant = {
  productId: string; title: string | null; canonicalSku: string; variantId: string;
  sku: string; size: string | null; available: number; unitsSold: number;
  revenueCents: number; daysOfCover: number | null;
  status: "out_of_stock" | "stock_risk" | "low_stock" | "ok";
};
type InventoryResponse = {
  periodDays: number;
  totals: { variantCount: number; totalAvailable: number; unitsSold: number; revenueCents: number; lowStockCount: number; stockRiskCount: number; outOfStockCount: number };
  variants: InventoryVariant[];
};

type RevenueTrend = { current: number; prior: number; trend: "up" | "down" | "flat"; deltaPercent: number };

export type AiAction = {
  id: string;
  type: "seo-rewrite" | "price-fix" | "listing-fix" | "amazon-rewrite" | "expand" | "sync-fix" | "reorder";
  title: string;
  reason: string;
  impact: string;
  target: string;
  href: string;
  cta: string;
  preview?: { from: string; to: string } | null;
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function getStatus(): Promise<StatusResponse | null> {
  try { const r = await fetch(`${apiBaseUrl}/api/status`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
async function getAlerts(): Promise<Alert[]> {
  try { const r = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" }); return r.ok ? r.json() : []; } catch { return []; }
}
async function getCrossChannel(): Promise<CrossChannelRow[]> {
  try { const r = await fetch(`${apiBaseUrl}/api/cross-channel`, { cache: "no-store" }); return r.ok ? r.json() : []; } catch { return []; }
}
async function getGsc(): Promise<GscSummary | null> {
  try { const r = await fetch(`${apiBaseUrl}/api/search-console/summary`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
async function getInventory(): Promise<InventoryResponse | null> {
  try { const r = await fetch(`${apiBaseUrl}/api/inventory`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
async function getRevenueTrend(): Promise<RevenueTrend | null> {
  try { const r = await fetch(`${apiBaseUrl}/api/revenue-trend`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
async function getAlmostPage1(): Promise<AlmostPage1Row[]> {
  try { const r = await fetch(`${apiBaseUrl}/api/search-console/almost-page-1`, { cache: "no-store" }); return r.ok ? r.json() : []; } catch { return []; }
}
async function getLowCtr(): Promise<AlmostPage1Row[]> {
  try { const r = await fetch(`${apiBaseUrl}/api/search-console/low-ctr`, { cache: "no-store" }); return r.ok ? r.json() : []; } catch { return []; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify", merchant: "Merchant", search_console: "Search Console", amazon_sp: "Amazon",
};
const PLATFORM_HREFS: Record<string, string> = {
  shopify: "/shopify", merchant: "/merchant", search_console: "/search-console", amazon_sp: "/amazon",
};

function fmtNum(n: number) { return new Intl.NumberFormat("en").format(n); }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmtNum(n); }
function currency(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
function seoActionHref(q: AlmostPage1Row) {
  if (!q.matchedProductId) return "/search-console";
  const params = new URLSearchParams({
    ai: "seo-rewrite",
    query: q.query,
    position: q.position.toFixed(1),
    impressions: String(q.impressions),
  });
  if (q.matchedPageUrl) params.set("url", q.matchedPageUrl);
  return `/products/${q.matchedProductId}?${params.toString()}#ai-actions`;
}
function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function integrationStatus(i: IntegrationStatus): "active" | "syncing" | "error" | "idle" {
  if (i.status === "error" || i.failed_jobs > 0) return "error";
  if (i.pending_jobs > 0) return "syncing";
  if (i.status === "active") return "active";
  return "idle";
}

function buildAiActions(
  almostPage1: AlmostPage1Row[],
  alerts: Alert[],
  crossChannel: CrossChannelRow[],
  inventory: InventoryResponse | null,
  integrations: IntegrationStatus[],
): AiAction[] {
  const actions: AiAction[] = [];

  // SEO rewrites from almost-page-1 (top 2 by potential)
  almostPage1.slice(0, 2).forEach((q, i) => {
    const extraClicks = q.potentialExtraClicks > 0 ? q.potentialExtraClicks : Math.round((0.05 - q.ctr) * q.impressions);
    actions.push({
      id: `seo-${i}`,
      type: "seo-rewrite",
      title: `Rewrite SEO title${q.matchedProductTitle ? ` — ${q.matchedProductTitle}` : ` for "${q.query}"`}`,
      reason: `Pos ${q.position.toFixed(1)} with ${fmtK(q.impressions)} impressions but ${(q.ctr * 100).toFixed(1)}% CTR. Title likely missing the search modifier.`,
      impact: extraClicks > 0 ? `+${fmtNum(extraClicks)} clicks/mo est.` : "Higher CTR est.",
      target: "Shopify",
      href: seoActionHref(q),
      cta: "Review SEO fix",
    });
  });

  // High-severity listing/price alerts
  const listingAlerts = alerts.filter(a =>
    ["listing_issue", "price_mismatch", "connector_error"].includes(a.category) &&
    (a.severity === "critical" || a.severity === "high")
  );
  if (listingAlerts.length > 0) {
    const top = listingAlerts[0];
    const name = top.payloadJson?.title ?? top.payloadJson?.merchant_product_name ?? top.entityRef ?? "listing";
    actions.push({
      id: `alert-${top.id}`,
      type: "price-fix",
      title: listingAlerts.length > 1 ? `Fix ${listingAlerts.length} listing issues across channels` : `Fix listing issue — ${name}`,
      reason: `${PLATFORM_LABELS[top.sourcePlatform ?? ""] ?? top.sourcePlatform ?? "Channel"} rejected ${listingAlerts.length > 1 ? "listings" : "listing"} — likely price or data mismatch.`,
      impact: `Restores ${listingAlerts.length} listing${listingAlerts.length !== 1 ? "s" : ""}`,
      target: "Shopify",
      href: "/alerts",
      cta: "Review alerts",
    });
  }

  // Amazon expansion (top product by revenue with no listing)
  const noListing = crossChannel
    .filter(r => r.flag === "no_listing" || r.flag === "opportunity")
    .sort((a, b) => b.revenueCents - a.revenueCents);
  if (noListing.length > 0) {
    const top = noListing[0];
    actions.push({
      id: `expand-${top.productId}`,
      type: "expand",
      title: `Create Amazon listing — ${top.title ?? top.canonicalSku}`,
      reason: `${currency(top.revenueCents)} Shopify revenue with no Amazon presence.${top.gscImpressions > 0 ? ` ${fmtK(top.gscImpressions)} GSC impressions.` : ""}`,
      impact: "+revenue/mo est.",
      target: "Amazon",
      href: `/products/${top.productId}`,
      cta: "Review product",
    });
  }

  // Out-of-stock items
  const outOfStock = (inventory?.variants ?? []).filter(v => v.status === "out_of_stock");
  if (outOfStock.length > 0) {
    const names = outOfStock.slice(0, 2).map(v => v.title ?? v.sku);
    const revenueAtRisk = outOfStock.reduce((s, v) => s + v.revenueCents, 0);
    actions.push({
      id: "reorder",
      type: "reorder",
      title: `Restock ${outOfStock.length} out-of-stock variant${outOfStock.length !== 1 ? "s" : ""}`,
      reason: `${names.join(", ")}${outOfStock.length > 2 ? ` and ${outOfStock.length - 2} more` : ""} are sold out.`,
      impact: revenueAtRisk > 0 ? `${currency(revenueAtRisk)} revenue at risk` : "Recover lost sales",
      target: "Shopify",
      href: "/inventory",
      cta: "Review inventory",
    });
  }

  // Failed sync jobs
  const failedIntegrations = integrations.filter(i => i.failed_jobs > 0);
  if (failedIntegrations.length > 0) {
    const totalFailed = failedIntegrations.reduce((s, i) => s + i.failed_jobs, 0);
    const names = failedIntegrations.map(i => PLATFORM_LABELS[i.platform] ?? i.platform);
    actions.push({
      id: "sync-fix",
      type: "sync-fix",
      title: `Clear ${totalFailed} failed sync job${totalFailed !== 1 ? "s" : ""}`,
      reason: `${names.join(", ")} sync failures — channel data may be stale.`,
      impact: "Restores data freshness",
      target: "Operations",
      href: "/operations",
      cta: "Open operations",
    });
  }

  return actions;
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function DeltaChip({ delta, invert = false }: { delta: number; invert?: boolean }) {
  const good = invert ? delta < 0 : delta > 0;
  const color = Math.abs(delta) < 0.005 ? "var(--ss-ink-3)" : good ? "var(--ss-sage-ink)" : "var(--ss-red-ink)";
  return (
    <span className="ss-num" style={{ fontSize: 11, fontWeight: 500, color }}>
      {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, delta, invert, sub }: {
  label: string; value: string; delta?: number; invert?: boolean; sub?: string;
}) {
  return (
    <div className="ss-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, minHeight: 100 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="ss-num" style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--ss-font-display)", letterSpacing: "-0.02em", color: "var(--ss-ink)" }}>
          {value}
        </div>
        {delta !== undefined && <DeltaChip delta={delta} invert={invert} />}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{sub}</div>}
    </div>
  );
}

// ─── Async sections ───────────────────────────────────────────────────────────

async function SeoOpportunitiesSection() {
  const [almostPage1, lowCtr] = await Promise.all([getAlmostPage1(), getLowCtr()]);
  if (almostPage1.length === 0 && lowCtr.length === 0) return null;
  return (
    <div className="space-y-4">
      <LowCtrTable rows={lowCtr} />
      <AlmostPage1Table rows={almostPage1} />
    </div>
  );
}

async function KpiStrip() {
  const [gsc, inventory, revenueTrend] = await Promise.all([getGsc(), getInventory(), getRevenueTrend()]);
  const inv = inventory?.totals;
  return (
    <div className="ss-kpi-grid">
      <KpiCard label="GSC Clicks · 90d" value={fmtK(gsc?.clicks ?? 0)} sub={gsc ? `${(gsc.ctr * 100).toFixed(1)}% CTR` : "No data"} />
      <KpiCard label="GSC Impressions · 90d" value={fmtK(gsc?.impressions ?? 0)} sub={gsc ? `Avg pos ${gsc.position.toFixed(1)}` : "No data"} />
      <KpiCard
        label="Revenue tracked · 90d"
        value={currency(inv?.revenueCents ?? 0)}
        delta={revenueTrend && revenueTrend.prior > 0 ? revenueTrend.deltaPercent / 100 : undefined}
        sub={`${fmtNum(inv?.unitsSold ?? 0)} units sold`}
      />
      <KpiCard label="Avg Position" value={gsc ? gsc.position.toFixed(1) : "—"} invert sub="Google Search Console" />
    </div>
  );
}

async function AiFeedSection() {
  const [almostPage1, alerts, crossChannel, inventory, status] = await Promise.all([
    getAlmostPage1(), getAlerts(), getCrossChannel(), getInventory(), getStatus(),
  ]);
  const actions = buildAiActions(almostPage1, alerts, crossChannel, inventory, status?.integrations ?? []);
  return <AiFeed actions={actions} />;
}

async function ChannelHealthSection() {
  const [status, gsc] = await Promise.all([getStatus(), getGsc()]);
  const integrations = status?.integrations ?? [];
  const totals = integrations.reduce(
    (acc, i) => ({
      products: Math.max(acc.products, i.product_count),
      variants: Math.max(acc.variants, i.variant_count),
      failedJobs: acc.failedJobs + i.failed_jobs,
    }),
    { products: 0, variants: 0, failedJobs: 0 },
  );

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>Channel Health</div>
        <Link href="/operations" style={{ fontSize: 12, color: "var(--ss-orange)", textDecoration: "none" }}>Operations →</Link>
      </div>
      <div className="ss-channel-health-grid" style={{ "--ss-health-count": Math.max(integrations.length, 1) } as CSSProperties}>
        {integrations.map((integration, i) => (
          <Link key={integration.id} href={PLATFORM_HREFS[integration.platform] ?? "/operations"}
            style={{
              display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px",
              borderRight: i < integrations.length - 1 ? "1px solid var(--ss-line)" : "none",
              textDecoration: "none",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ss-ink)" }}>
                {PLATFORM_LABELS[integration.platform] ?? integration.platform}
              </div>
              <StatusPill status={integrationStatus(integration)} />
            </div>
            <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)" }}>
              {relativeTime(integration.last_synced_at)}
            </div>
            {integration.open_alerts > 0 && (
              <span className="ss-num" style={{ fontSize: 11, color: "var(--ss-amber-ink)", fontWeight: 600 }}>
                {integration.open_alerts} alert{integration.open_alerts !== 1 ? "s" : ""}
              </span>
            )}
          </Link>
        ))}
        {integrations.length === 0 && (
          <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>
            No integrations connected.
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderTop: "1px solid var(--ss-line)" }}>
        <span className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)" }}>
          {fmtNum(totals.products)} products · {fmtNum(totals.variants)} variants
          {gsc ? ` · ${fmtK(gsc.impressions)} GSC impr.` : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {totals.failedJobs > 0 && (
            <Link href="/operations" style={{ fontSize: 11, color: "var(--ss-red)", textDecoration: "none", fontFamily: "var(--ss-font-mono)" }}>
              {totals.failedJobs} failed job{totals.failedJobs !== 1 ? "s" : ""}
            </Link>
          )}
          <StatusPill status={status?.ok ? "active" : "error"} label={status?.ok ? "API online" : "API offline"} />
        </div>
      </div>
    </div>
  );
}

async function TopbarBreadcrumb() {
  const status = await getStatus();
  const syncTimes = (status?.integrations ?? []).map(i => i.last_synced_at).filter(Boolean) as string[];
  const latestSync = syncTimes.length
    ? relativeTime(new Date(Math.max(...syncTimes.map(t => new Date(t).getTime()))).toISOString())
    : null;
  return (
    <div style={{ fontSize: 13, color: "var(--ss-ink-3)" }}>
      <span style={{ margin: "0 6px", color: "var(--ss-ink-4)" }}>/</span>
      {latestSync ? `Last sync ${latestSync}` : "No sync yet"}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  return (
    <>
      <AutoRefresh intervalMs={30_000} />

      <div className="ss-page-topbar ss-topbar-blur sticky z-10 flex items-center gap-3 border-b"
        style={{ borderColor: "var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)" }}>
          Command Center
        </div>
        <Suspense fallback={
          <div style={{ fontSize: 13, color: "var(--ss-ink-4)" }}>
            <span style={{ margin: "0 6px" }}>/</span>Loading…
          </div>
        }>
          <TopbarBreadcrumb />
        </Suspense>
        <div style={{ flex: 1 }} />
        <TopbarSearch />
      </div>

      <div className="ss-content-stack">
        <Suspense fallback={
          <div className="ss-kpi-grid">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        }>
          <KpiStrip />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={5} />}>
          <AiFeedSection />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={6} />}>
          <SeoOpportunitiesSection />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <ChannelHealthSection />
        </Suspense>
      </div>
    </>
  );
}

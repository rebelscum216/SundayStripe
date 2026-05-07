import { Suspense } from "react";
import Link from "next/link";
import { AutoRefresh } from "./auto-refresh";
import { CardSkeleton, SectionSkeleton, Skeleton } from "./components/skeleton";
import { StatusPill } from "./components/status-pill";

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
  payloadJson: { title?: string; merchant_product_name?: string; offer_id?: string } | null;
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
  totals: {
    variantCount: number; totalAvailable: number; unitsSold: number; revenueCents: number;
    lowStockCount: number; stockRiskCount: number; outOfStockCount: number;
  };
  variants: InventoryVariant[];
};

type PriorityItem = {
  id: string; rank: number; label: string; title: string; detail: string;
  href: string; action: string; tone: "bad" | "warn" | "blue";
};

type RevenueTrend = { current: number; prior: number; trend: "up" | "down" | "flat"; deltaPercent: number };

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/status`, { cache: "no-store" });
    return res.ok ? (await res.json()) as StatusResponse : null;
  } catch { return null; }
}
async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" });
    return res.ok ? (await res.json()) as Alert[] : [];
  } catch { return []; }
}
async function getCrossChannel(): Promise<CrossChannelRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/cross-channel`, { cache: "no-store" });
    return res.ok ? (await res.json()) as CrossChannelRow[] : [];
  } catch { return []; }
}
async function getGsc(): Promise<GscSummary | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/summary`, { cache: "no-store" });
    return res.ok ? (await res.json()) as GscSummary : null;
  } catch { return null; }
}
async function getInventory(): Promise<InventoryResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/inventory`, { cache: "no-store" });
    return res.ok ? (await res.json()) as InventoryResponse : null;
  } catch { return null; }
}
async function getRevenueTrend(): Promise<RevenueTrend | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/revenue-trend`, { cache: "no-store" });
    return res.ok ? (await res.json()) as RevenueTrend : null;
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify", merchant: "Merchant", search_console: "Search Console", amazon_sp: "Amazon",
};
const PLATFORM_HREFS: Record<string, string> = {
  shopify: "/shopify", merchant: "/merchant", search_console: "/search-console", amazon_sp: "/amazon",
};
const CATEGORY_LABELS: Record<string, string> = {
  listing_issue: "Listing issue", sync_lag: "Sync failure",
  inventory_drift: "Inventory drift", connector_error: "Connector error",
};
const FLAG_META: Record<CrossChannelRow["flag"], { label: string; tone: string; href: string }> = {
  no_revenue: { label: "Traffic not converting", tone: "red",    href: "/cross-channel" },
  opportunity: { label: "Expand to Amazon",      tone: "amber",  href: "/cross-channel" },
  no_listing:  { label: "Missing Merchant",       tone: "orange", href: "/cross-channel" },
  ok:          { label: "OK",                     tone: "sage",   href: "/cross-channel" },
};

function fmtNum(n: number) { return new Intl.NumberFormat("en").format(n); }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmtNum(n); }
function currency(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
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
function alertTitle(a: Alert) {
  return a.payloadJson?.title ?? a.payloadJson?.merchant_product_name ?? a.payloadJson?.offer_id ?? a.entityRef ?? "Alert";
}

function buildPriorityItems(
  integrations: IntegrationStatus[], alerts: Alert[],
  crossChannel: CrossChannelRow[], inventory: InventoryResponse | null,
): PriorityItem[] {
  const riskVariants = (inventory?.variants ?? []).filter((v) => v.status !== "ok");
  const actionableOps = crossChannel.filter((row) => row.flag !== "ok");
  const priorityAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high");
  return [
    ...integrations.filter((i) => i.failed_jobs > 0).map((i) => ({
      id: `failed-${i.id}`, rank: 100 + i.failed_jobs,
      label: "Sync failure",
      title: `${PLATFORM_LABELS[i.platform] ?? i.platform} has ${i.failed_jobs} failed job${i.failed_jobs !== 1 ? "s" : ""}`,
      detail: "Clear or retry failed jobs so channel data stays fresh.",
      href: "/operations", action: "Open operations", tone: "bad" as const,
    })),
    ...priorityAlerts.slice(0, 4).map((alert) => ({
      id: `alert-${alert.id}`, rank: alert.severity === "critical" ? 90 : 80,
      label: CATEGORY_LABELS[alert.category] ?? alert.category,
      title: alertTitle(alert),
      detail: `${PLATFORM_LABELS[alert.sourcePlatform ?? ""] ?? alert.sourcePlatform ?? "Channel"} needs review.`,
      href: "/alerts", action: "Review alert",
      tone: alert.severity === "critical" ? ("bad" as const) : ("warn" as const),
    })),
    ...riskVariants.slice(0, 3).map((v) => ({
      id: `stock-${v.variantId}`, rank: v.status === "out_of_stock" ? 70 : 60,
      label: v.status === "out_of_stock" ? "Out of stock" : "Inventory risk",
      title: v.title ?? v.canonicalSku,
      detail: `${v.sku} has ${fmtNum(v.available)} available, ${fmtNum(v.unitsSold)} sold in 90d.`,
      href: `/products/${v.productId}`, action: "Open product",
      tone: v.status === "out_of_stock" ? ("bad" as const) : ("warn" as const),
    })),
    ...actionableOps.slice(0, 3).map((row) => ({
      id: `opp-${row.productId}-${row.flag}`, rank: 40,
      label: FLAG_META[row.flag].label, title: row.title ?? row.canonicalSku,
      detail: `${currency(row.revenueCents)} revenue, ${fmtNum(row.gscImpressions)} GSC impressions.`,
      href: "/cross-channel", action: "Analyze", tone: "blue" as const,
    })),
  ].sort((a, b) => b.rank - a.rank).slice(0, 7);
}

// ─── Pill helper ──────────────────────────────────────────────────────────────

function TonePill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    bad:    "ss-pill ss-pill-red",
    warn:   "ss-pill ss-pill-amber",
    blue:   "ss-pill ss-pill-orange",
    red:    "ss-pill ss-pill-red",
    amber:  "ss-pill ss-pill-amber",
    orange: "ss-pill ss-pill-orange",
    sage:   "ss-pill ss-pill-sage",
  };
  return <span className={cls[tone] ?? "ss-pill"}>{children}</span>;
}

// ─── Topbar (shared across page sections) ────────────────────────────────────

function Topbar({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="ss-topbar-blur sticky top-0 z-10 flex items-center gap-3 border-b px-6 py-3"
      style={{ borderColor: "var(--ss-line)" }}>
      <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)" }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: 13, color: "var(--ss-ink-3)" }}>
          <span style={{ margin: "0 6px", color: "var(--ss-ink-4)" }}>/</span>{sub}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ─── KPI card (new design) ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accentBg }: {
  label: string; value: string; sub?: string; accentBg?: boolean;
}) {
  return (
    <div className="ss-card" style={{
      padding: 16, display: "flex", flexDirection: "column", gap: 6, minHeight: 100,
      ...(accentBg ? { background: "var(--ss-orange-soft)", borderColor: "transparent" } : {}),
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: accentBg ? "var(--ss-orange-ink)" : "var(--ss-ink-3)", fontWeight: 500 }}>
        {label}
      </div>
      <div className="ss-num" style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--ss-font-display)", letterSpacing: "-0.02em", color: accentBg ? "var(--ss-orange-ink)" : "var(--ss-ink)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: accentBg ? "var(--ss-orange-ink)" : "var(--ss-ink-3)" }}>{sub}</div>}
    </div>
  );
}

// ─── Async sections ───────────────────────────────────────────────────────────

async function KpiStrip() {
  const [gsc, inventory, revenueTrend] = await Promise.all([getGsc(), getInventory(), getRevenueTrend()]);
  const inv = inventory?.totals;
  const riskCount = (inventory?.variants ?? []).filter((v) => v.status !== "ok").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "0 24px" }}>
      <KpiCard
        label="GSC Clicks · 30d"
        value={fmtK(gsc?.clicks ?? 0)}
        sub={gsc ? `${(gsc.ctr * 100).toFixed(1)}% CTR · pos ${gsc.position.toFixed(1)}` : "No data"}
      />
      <KpiCard
        label="GSC Impressions · 30d"
        value={fmtK(gsc?.impressions ?? 0)}
        sub="From Search Console"
      />
      <KpiCard
        label="Revenue tracked · 90d"
        value={currency(inv?.revenueCents ?? 0)}
        sub={revenueTrend && revenueTrend.prior > 0
          ? `${revenueTrend.deltaPercent > 0 ? "+" : ""}${revenueTrend.deltaPercent}% vs prior 45d`
          : `${fmtNum(inv?.unitsSold ?? 0)} units sold`}
      />
      <KpiCard
        label="Inventory risk"
        value={fmtNum(riskCount)}
        sub={`${fmtNum(inv?.outOfStockCount ?? 0)} out of stock`}
        accentBg={riskCount > 0}
      />
    </div>
  );
}

async function PriorityStackSection() {
  const [status, alerts, crossChannel, inventory] = await Promise.all([
    getStatus(), getAlerts(), getCrossChannel(), getInventory(),
  ]);
  const priorityItems = buildPriorityItems(status?.integrations ?? [], alerts, crossChannel, inventory);

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid var(--ss-line)",
      }}>
        <div>
          <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600 }}>
            {"Today's Priority Stack"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
            Ranked by sync risk, alert severity, stock risk, and growth upside
          </div>
        </div>
        <Link href="/alerts" style={{ fontSize: 12, color: "var(--ss-orange)", textDecoration: "none" }}>
          Triage alerts
        </Link>
      </div>

      {priorityItems.length === 0 ? (
        <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>
          No urgent work found. Channel data is quiet.
        </div>
      ) : (
        priorityItems.map((item, i) => (
          <div key={item.id} style={{
            display: "grid",
            gridTemplateColumns: "28px auto 1fr auto",
            gap: 14, padding: "12px 16px",
            borderBottom: i === priorityItems.length - 1 ? "none" : "1px solid var(--ss-line)",
            alignItems: "center",
          }}>
            <div className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-4)" }}>{i + 1}</div>
            <TonePill tone={item.tone}>{item.label}</TonePill>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ss-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.detail}
              </div>
            </div>
            <Link href={item.href} className="ss-btn ss-btn-sm" style={{ flexShrink: 0 }}>
              {item.action}
            </Link>
          </div>
        ))
      )}
    </div>
  );
}

async function RevenueAtRiskSection() {
  const inventory = await getInventory();
  const riskVariants = (inventory?.variants ?? []).filter((v) => v.status !== "ok");
  const display = riskVariants.length > 0 ? riskVariants : (inventory?.variants ?? []).slice(0, 5);

  const statusStyle: Record<string, string> = {
    out_of_stock: "ss-pill ss-pill-red",
    stock_risk:   "ss-pill ss-pill-orange",
    low_stock:    "ss-pill ss-pill-amber",
    ok:           "ss-pill ss-pill-sage",
  };

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600 }}>Revenue At Risk</div>
        <Link href="/inventory" style={{ fontSize: 12, color: "var(--ss-orange)", textDecoration: "none" }}>Open inventory</Link>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="ss-tbl" style={{ minWidth: 640 }}>
          <thead><tr>
            <th>Variant</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Available</th>
            <th style={{ textAlign: "right" }}>Sold 90d</th>
            <th style={{ textAlign: "right" }}>Days cover</th>
            <th style={{ textAlign: "right" }}>Revenue</th>
          </tr></thead>
          <tbody>
            {display.slice(0, 7).map((v) => (
              <tr key={v.variantId}>
                <td>
                  <Link href={`/products/${v.productId}`} style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}>
                    {v.title ?? v.canonicalSku}
                  </Link>
                  <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)", marginTop: 2 }}>
                    {v.sku}{v.size ? ` · ${v.size}` : ""}
                  </div>
                </td>
                <td><span className={statusStyle[v.status] ?? "ss-pill"}>{v.status.replace(/_/g, " ")}</span></td>
                <td className="ss-num" style={{ textAlign: "right", color: v.available <= 0 ? "var(--ss-red)" : "var(--ss-ink-2)" }}>{fmtNum(v.available)}</td>
                <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmtNum(v.unitsSold)}</td>
                <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{v.daysOfCover ?? "—"}</td>
                <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-sage-ink)", fontWeight: 600 }}>{currency(v.revenueCents)}</td>
              </tr>
            ))}
            {display.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", color: "var(--ss-ink-3)", fontSize: 13 }}>No inventory data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function CrossChannelSection() {
  const crossChannel = await getCrossChannel();
  const actionable = crossChannel.filter((r) => r.flag !== "ok")
    .sort((a, b) => (b.revenueCents + b.gscImpressions * 10) - (a.revenueCents + a.gscImpressions * 10))
    .slice(0, 4);

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600 }}>Cross-Channel Opportunities</div>
        <Link href="/cross-channel" style={{ fontSize: 12, color: "var(--ss-orange)", textDecoration: "none" }}>View all</Link>
      </div>
      {actionable.length === 0 ? (
        <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>No actionable opportunities found.</div>
      ) : (
        actionable.map((row, i) => {
          const meta = FLAG_META[row.flag];
          return (
            <div key={row.productId} style={{
              display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
              padding: "12px 16px", borderBottom: i === actionable.length - 1 ? "none" : "1px solid var(--ss-line)",
              alignItems: "center",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ss-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.title ?? row.canonicalSku}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <TonePill tone={meta.tone}>{meta.label}</TonePill>
                  <span className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)" }}>
                    {row.revenueCents > 0 ? currency(row.revenueCents) : "no revenue"}
                    {row.gscImpressions > 0 ? ` · ${fmtNum(row.gscImpressions)} impr.` : ""}
                  </span>
                </div>
              </div>
              <Link href={`/products/${row.productId}`} className="ss-btn ss-btn-sm">Analyze</Link>
            </div>
          );
        })
      )}
    </div>
  );
}

async function TopActionSection() {
  const [status, alerts, crossChannel, inventory] = await Promise.all([
    getStatus(), getAlerts(), getCrossChannel(), getInventory(),
  ]);
  const priorityItems = buildPriorityItems(status?.integrations ?? [], alerts, crossChannel, inventory);
  const top = priorityItems[0];
  const aiAction = top
    ? { title: top.title, detail: top.detail, href: top.href, action: top.action }
    : { title: "No urgent action", detail: "Core systems are quiet. Review cross-channel opportunities for growth work.", href: "/cross-channel", action: "Review opportunities" };

  return (
    <div className="ss-card" style={{
      padding: 20,
      background: "linear-gradient(135deg, var(--ss-bg-card) 0%, var(--ss-orange-soft) 200%)",
      borderColor: "var(--ss-orange-soft)",
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-orange-ink)", fontWeight: 600, marginBottom: 8 }}>
        Top Action
      </div>
      <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)", marginBottom: 8 }}>
        {aiAction.title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ss-ink-3)", marginBottom: 16 }}>
        {aiAction.detail}
      </div>
      <Link href={aiAction.href} className="ss-btn ss-btn-primary ss-btn-sm">
        {aiAction.action} →
      </Link>
    </div>
  );
}

async function ChannelHealthSection() {
  const [status, gsc] = await Promise.all([getStatus(), getGsc()]);
  const integrations = status?.integrations ?? [];
  const totals = integrations.reduce(
    (acc, i) => ({
      products: Math.max(acc.products, i.product_count),
      variants: Math.max(acc.variants, i.variant_count),
      pendingJobs: acc.pendingJobs + i.pending_jobs,
      failedJobs: acc.failedJobs + i.failed_jobs,
    }),
    { products: 0, variants: 0, pendingJobs: 0, failedJobs: 0 },
  );

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600 }}>Channel Health</div>
        <Link href="/operations" style={{ fontSize: 12, color: "var(--ss-orange)", textDecoration: "none" }}>Operations</Link>
      </div>
      {integrations.map((integration) => (
        <Link key={integration.id} href={PLATFORM_HREFS[integration.platform] ?? "/operations"}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--ss-line)", textDecoration: "none" }}
          className="channel-health-row">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ss-ink)" }}>
              {PLATFORM_LABELS[integration.platform] ?? integration.platform}
            </div>
            <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)", marginTop: 2 }}>
              {relativeTime(integration.last_synced_at)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {integration.open_alerts > 0 && (
              <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-amber-ink)", fontWeight: 600 }}>
                {integration.open_alerts}
              </span>
            )}
            <StatusPill status={integrationStatus(integration)} />
          </div>
        </Link>
      ))}
      {integrations.length === 0 && (
        <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>No integrations connected.</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--ss-line)" }}>
        <span className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-3)" }}>
          {fmtNum(totals.products)} products · {fmtNum(totals.variants)} variants
          {gsc ? ` · ${fmtK(gsc.impressions)} GSC impr.` : ""}
        </span>
        <StatusPill status={status?.ok ? "active" : "error"} label={status?.ok ? "API online" : "API offline"} />
      </div>
      {totals.failedJobs > 0 && (
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--ss-line)", fontSize: 12, color: "var(--ss-red)" }}>
          {fmtNum(totals.failedJobs)} failed {totals.failedJobs === 1 ? "job" : "jobs"} —{" "}
          <Link href="/operations" style={{ color: "var(--ss-red)", textDecoration: "underline" }}>clear in Operations</Link>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  return (
    <>
      <AutoRefresh intervalMs={30_000} />

      <Topbar title="Command Center" sub="Live operating cockpit" />

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* KPI strip */}
        <Suspense fallback={
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        }>
          <KpiStrip />
        </Suspense>

        {/* Main 2-col layout */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Suspense fallback={<SectionSkeleton rows={5} />}>
              <PriorityStackSection />
            </Suspense>
            <Suspense fallback={<SectionSkeleton rows={4} />}>
              <RevenueAtRiskSection />
            </Suspense>
            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <CrossChannelSection />
            </Suspense>
          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Suspense fallback={
              <div className="ss-card" style={{ padding: 20 }}>
                <Skeleton className="mb-3 h-3 w-20" />
                <Skeleton className="mb-2 h-6 w-48" />
                <Skeleton className="mb-1 h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-4 h-7 w-28" />
              </div>
            }>
              <TopActionSection />
            </Suspense>
            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <ChannelHealthSection />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}

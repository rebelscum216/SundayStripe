import Link from "next/link";
import { MetricCard } from "../components/metric-card";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";

type InventoryVariant = {
  productId: string;
  title: string | null;
  canonicalSku: string;
  variantId: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  available: number;
  onHand: number;
  committed: number;
  incoming: number;
  unitsSold: number;
  revenueCents: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  status: "out_of_stock" | "stock_risk" | "low_stock" | "ok";
  updatedAt: string | null;
  locations: Array<{
    locationKey: string;
    name: string;
    available: number;
    onHand: number;
    committed: number;
    incoming: number;
  }>;
};

type InventoryResponse = {
  periodDays: number;
  totals: {
    productCount: number;
    variantCount: number;
    totalAvailable: number;
    totalOnHand: number;
    totalCommitted: number;
    totalIncoming: number;
    unitsSold: number;
    revenueCents: number;
    lowStockCount: number;
    stockRiskCount: number;
    outOfStockCount: number;
  };
  locations: Array<{
    locationKey: string;
    name: string;
    available: number;
    onHand: number;
    committed: number;
    incoming: number;
  }>;
  variants: InventoryVariant[];
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getInventory(): Promise<InventoryResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/inventory`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as InventoryResponse;
  } catch {
    return null;
  }
}

const STATUS_META: Record<InventoryVariant["status"], { label: string; className: string }> = {
  out_of_stock: {
    label: "Out of stock",
    className: "ss-pill ss-pill-red",
  },
  stock_risk: {
    label: "Stock risk",
    className: "ss-pill ss-pill-amber",
  },
  low_stock: {
    label: "Low stock",
    className: "ss-pill ss-pill-amber",
  },
  ok: {
    label: "OK",
    className: "ss-pill ss-pill-sage",
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDays(value: number | null) {
  if (value === null) return "-";
  if (value > 999) return "999+";
  return value.toFixed(value < 10 ? 1 : 0);
}

function statusBadge(status: InventoryVariant["status"]) {
  const meta = STATUS_META[status];
  return (
    <span className={meta.className}>
      {meta.label}
    </span>
  );
}

function RiskStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "amber" | "default";
}) {
  const toneStyle = tone === "red"
    ? { borderColor: "var(--ss-red-soft)", background: "color-mix(in oklab, var(--ss-red-soft) 35%, var(--ss-bg-card))", labelColor: "var(--ss-red-ink)" }
    : tone === "amber"
      ? { borderColor: "var(--ss-amber-soft)", background: "color-mix(in oklab, var(--ss-amber-soft) 35%, var(--ss-bg-card))", labelColor: "var(--ss-amber-ink)" }
      : { borderColor: "var(--ss-line)", background: "var(--ss-bg-card)", labelColor: "var(--ss-ink-3)" };

  return (
    <div className="ss-card" style={{ padding: "12px 16px", borderColor: toneStyle.borderColor, background: toneStyle.background }}>
      <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: toneStyle.labelColor }}>
        {label}
      </p>
      <p className="ss-num" style={{ marginTop: 8, fontFamily: "var(--ss-font-display)", fontSize: 28, fontWeight: 600, color: "var(--ss-ink)" }}>
        {value}
      </p>
    </div>
  );
}

export default async function InventoryPage() {
  const data = await getInventory();
  const totals = data?.totals;
  const variants = data?.variants ?? [];
  const locations = data?.locations ?? [];
  const riskRows = variants.filter((row) => row.status !== "ok").slice(0, 40);
  const velocityRows = variants
    .filter((row) => row.unitsSold > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 30);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Workspace" title="Inventory" meta="90-day stock radar" />

      {!data || !totals ? (
        <section className="ss-card" style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)", fontSize: 13 }}>
          Inventory data is not available.
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Available" value={formatNumber(totals.totalAvailable)} sub={`${formatNumber(totals.variantCount)} variants`} />
            <MetricCard label="On hand" value={formatNumber(totals.totalOnHand)} />
            <MetricCard label="Committed" value={formatNumber(totals.totalCommitted)} />
            <MetricCard label="Units sold" value={formatNumber(totals.unitsSold)} sub={`${data.periodDays}-day window`} />
            <MetricCard label="Stock risk" value={formatNumber(totals.stockRiskCount + totals.lowStockCount + totals.outOfStockCount)} accent={totals.stockRiskCount + totals.lowStockCount + totals.outOfStockCount > 0 ? "warn" : "good"} />
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <RiskStat label="Out of stock" value={formatNumber(totals.outOfStockCount)} tone="red" />
            <RiskStat label="Velocity risk" value={formatNumber(totals.stockRiskCount)} tone="amber" />
            <RiskStat label="Revenue tracked" value={formatCurrency(totals.revenueCents)} tone="default" />
          </section>

          <section className="ss-card" style={{ overflow: "hidden" }}>
            <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>Stock Risk Queue</h2>
                <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>Out-of-stock, low-stock, and fast-moving variants.</p>
              </div>
              <StatusPill status={riskRows.length > 0 ? "syncing" : "active"} label={riskRows.length > 0 ? `${riskRows.length} to review` : "Clear"} />
            </div>
            <div className="overflow-x-auto">
              <table className="ss-tbl" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Available</th>
                    <th style={{ textAlign: "right" }}>On Hand</th>
                    <th style={{ textAlign: "right" }}>Committed</th>
                    <th style={{ textAlign: "right" }}>Sold 90d</th>
                    <th style={{ textAlign: "right" }}>Days Cover</th>
                    <th style={{ textAlign: "right" }}>Revenue</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(riskRows.length > 0 ? riskRows : variants.slice(0, 20)).map((variant) => (
                    <tr key={variant.variantId}>
                      <td>
                        <Link href={`/products/${variant.productId}`} style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}>
                          {variant.title ?? variant.canonicalSku}
                        </Link>
                        <div className="ss-num" style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--ss-ink-3)" }}>
                          <span>{variant.sku}</span>
                          {variant.size && <span>{variant.size}</span>}
                        </div>
                      </td>
                      <td>{statusBadge(variant.status)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: variant.available <= 0 ? "var(--ss-red-ink)" : "var(--ss-ink-2)" }}>{formatNumber(variant.available)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(variant.onHand)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(variant.committed)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(variant.unitsSold)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatDays(variant.daysOfCover)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatCurrency(variant.revenueCents)}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/products/${variant.productId}`} className="ss-btn ss-btn-sm">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {variants.length === 0 && (
                    <tr>
                      <td style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)" }} colSpan={9}>
                        No inventory variants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className="ss-card" style={{ overflow: "hidden" }}>
              <div style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>Revenue With Stock Position</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="ss-tbl" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th style={{ textAlign: "right" }}>Revenue</th>
                      <th style={{ textAlign: "right" }}>Units</th>
                      <th style={{ textAlign: "right" }}>Available</th>
                      <th style={{ textAlign: "right" }}>Days Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {velocityRows.map((variant) => (
                      <tr key={variant.variantId}>
                        <td>
                          <Link href={`/products/${variant.productId}`} style={{ fontWeight: 500, color: "var(--ss-ink)", textDecoration: "none" }}>
                            {variant.title ?? variant.canonicalSku}
                          </Link>
                          <p className="ss-num" style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>{variant.sku}</p>
                        </td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-sage-ink)" }}>{formatCurrency(variant.revenueCents)}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(variant.unitsSold)}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(variant.available)}</td>
                        <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatDays(variant.daysOfCover)}</td>
                      </tr>
                    ))}
                    {velocityRows.length === 0 && (
                      <tr>
                        <td style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)" }} colSpan={5}>
                          No recent variant sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ss-card" style={{ overflow: "hidden" }}>
              <div style={{ borderBottom: "1px solid var(--ss-line)", padding: "12px 16px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>Location Inventory</h2>
              </div>
              <table className="ss-tbl">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th style={{ textAlign: "right" }}>Avail</th>
                    <th style={{ textAlign: "right" }}>On Hand</th>
                    <th style={{ textAlign: "right" }}>Committed</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((location) => (
                    <tr key={location.locationKey}>
                      <td style={{ color: "var(--ss-ink-2)" }}>{location.name}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(location.available)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(location.onHand)}</td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{formatNumber(location.committed)}</td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr>
                      <td style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)" }} colSpan={4}>
                        No location inventory found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

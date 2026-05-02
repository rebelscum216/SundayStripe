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
    className: "border-red-500 bg-red-950 text-red-400",
  },
  stock_risk: {
    label: "Stock risk",
    className: "border-amber-500 bg-amber-950 text-amber-400",
  },
  low_stock: {
    label: "Low stock",
    className: "border-amber-500 bg-amber-950 text-amber-400",
  },
  ok: {
    label: "OK",
    className: "border-emerald-500 bg-emerald-950 text-emerald-400",
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
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
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
        <section className="rounded border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-500">
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
            <div className="rounded border border-red-500/60 bg-red-950/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">Out of stock</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-zinc-100">{formatNumber(totals.outOfStockCount)}</p>
            </div>
            <div className="rounded border border-amber-500/60 bg-amber-950/30 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-400">Velocity risk</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-zinc-100">{formatNumber(totals.stockRiskCount)}</p>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Revenue tracked</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-zinc-100">{formatCurrency(totals.revenueCents)}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Stock Risk Queue</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Out-of-stock, low-stock, and fast-moving variants.</p>
              </div>
              <StatusPill status={riskRows.length > 0 ? "syncing" : "active"} label={riskRows.length > 0 ? `${riskRows.length} to review` : "Clear"} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Variant</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Committed</th>
                    <th className="px-4 py-3 text-right">Sold 90d</th>
                    <th className="px-4 py-3 text-right">Days Cover</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(riskRows.length > 0 ? riskRows : variants.slice(0, 20)).map((variant) => (
                    <tr key={variant.variantId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                      <td className="px-4 py-3">
                        <Link href={`/products/${variant.productId}`} className="font-medium text-zinc-100 hover:underline">
                          {variant.title ?? variant.canonicalSku}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-2 font-mono text-xs text-zinc-500">
                          <span>{variant.sku}</span>
                          {variant.size && <span>{variant.size}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(variant.status)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${variant.available <= 0 ? "text-red-400" : "text-zinc-300"}`}>{formatNumber(variant.available)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(variant.onHand)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(variant.committed)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(variant.unitsSold)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatDays(variant.daysOfCover)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatCurrency(variant.revenueCents)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${variant.productId}`} className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {variants.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-zinc-500" colSpan={9}>
                        No inventory variants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">Revenue With Stock Position</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Variant</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3 text-right">Units</th>
                      <th className="px-4 py-3 text-right">Available</th>
                      <th className="px-4 py-3 text-right">Days Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {velocityRows.map((variant) => (
                      <tr key={variant.variantId} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                        <td className="px-4 py-3">
                          <Link href={`/products/${variant.productId}`} className="font-medium text-zinc-100 hover:underline">
                            {variant.title ?? variant.canonicalSku}
                          </Link>
                          <p className="mt-1 font-mono text-xs text-zinc-500">{variant.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{formatCurrency(variant.revenueCents)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(variant.unitsSold)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(variant.available)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatDays(variant.daysOfCover)}</td>
                      </tr>
                    ))}
                    {velocityRows.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-sm text-zinc-500" colSpan={5}>
                          No recent variant sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">Location Inventory</h2>
              </div>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3 text-right">Avail</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Committed</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((location) => (
                    <tr key={location.locationKey} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                      <td className="px-4 py-3 text-sm text-zinc-300">{location.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(location.available)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(location.onHand)}</td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatNumber(location.committed)}</td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-zinc-500" colSpan={4}>
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

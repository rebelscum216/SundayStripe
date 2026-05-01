type GscSummary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  row_count: number;
};

import { MetricCard } from "../components/metric-card";
import { PageHeader } from "../components/page-header";
import { QuickWinsTable } from "./quick-wins-table";

type GscRow = {
  query?: string;
  url?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getSummary(): Promise<GscSummary | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/summary`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as GscSummary;
  } catch {
    return null;
  }
}

async function getQueries(): Promise<GscRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/queries`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as GscRow[];
  } catch {
    return [];
  }
}

async function getPages(): Promise<GscRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/pages`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as GscRow[];
  } catch {
    return [];
  }
}

function positionClass(position: number) {
  if (position <= 3) return "text-emerald-400 font-semibold";
  if (position <= 10) return "text-zinc-100";
  if (position <= 20) return "text-amber-400";
  return "text-zinc-500";
}

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtPos(n: number) {
  return n.toFixed(1);
}

function PerformanceTable({
  rows,
  keyLabel,
  keyField,
}: {
  rows: GscRow[];
  keyLabel: string;
  keyField: "query" | "url";
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-zinc-400">No data yet - run the seed script first.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-4 py-3">{keyLabel}</th>
            <th className="px-4 py-3 text-right">Clicks</th>
            <th className="px-4 py-3 text-right">Impressions</th>
            <th className="px-4 py-3 text-right">CTR</th>
            <th className="px-4 py-3 text-right">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/40" key={i}>
              <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-zinc-300">
                {row[keyField] ?? "-"}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{fmt(row.clicks)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{fmt(row.impressions)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{fmtPct(row.ctr)}</td>
              <td className={`px-4 py-2.5 text-right font-mono ${positionClass(row.position)}`}>
                {fmtPos(row.position)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SearchConsolePage() {
  const [summary, queries, pages] = await Promise.all([getSummary(), getQueries(), getPages()]);

  const quickWins = pages.filter((p) => p.position >= 5 && p.position <= 20 && p.impressions >= 50);
  const topQueryStrings = queries.slice(0, 10).map((q) => q.query ?? "").filter(Boolean);

  const isEmpty = !summary || summary.row_count === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Analytics" title="Search Console" meta="90-day window" />

        {isEmpty ? (
          <div className="rounded border border-zinc-800 bg-zinc-900 px-6 py-10">
            <p className="text-sm font-medium text-zinc-100">No data synced yet.</p>
            <p className="mt-1 text-sm text-zinc-400">
              Run the seed script to pull data from Google Search Console:
            </p>
            <pre className="mt-3 rounded border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-zinc-300">
              cd apps/api && npx tsx src/scripts/seed-gsc.ts
            </pre>
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Clicks" value={fmt(summary.clicks)} sub="90 days" />
              <MetricCard label="Total Impressions" value={fmt(summary.impressions)} sub="90 days" />
              <MetricCard label="Avg CTR" value={fmtPct(summary.ctr)} />
              <MetricCard label="Avg Position" value={fmtPos(summary.position)} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Quick Wins
              </h2>
            <QuickWinsTable quickWins={quickWins} topQueries={topQueryStrings} />
            </section>

            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Top Queries
                  <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
                    {queries.length}
                  </span>
                </h2>
              </div>
              <PerformanceTable rows={queries} keyLabel="Query" keyField="query" />
            </section>

            <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Top Pages
                  <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
                    {pages.length}
                  </span>
                </h2>
              </div>
              <PerformanceTable rows={pages} keyLabel="Page" keyField="url" />
            </section>
          </>
        )}
    </div>
  );
}

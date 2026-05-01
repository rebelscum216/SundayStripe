import { PageHeader } from "../components/page-header";
import { CrossChannelBoard } from "./cross-channel-board";
import type { FlagCounts } from "./flag-chips";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

type CrossChannelRow = {
  productId: string;
  title: string | null;
  canonicalSku: string;
  revenueCents: number;
  unitsSold: number;
  gscImpressions: number;
  gscClicks: number;
  gscPosition: number | null;
  channels: string[];
  amazonQualityScore: number | null;
  flag: "no_revenue" | "opportunity" | "no_listing" | "ok";
};

async function getCrossChannel(): Promise<CrossChannelRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/cross-channel`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as CrossChannelRow[];
  } catch {
    return [];
  }
}

export default async function CrossChannelPage() {
  const rows = await getCrossChannel();

  const flagCounts = rows.reduce<FlagCounts>((acc, r) => {
    acc[r.flag] = (acc[r.flag] ?? 0) + 1;
    return acc;
  }, { all: rows.length, no_revenue: 0, opportunity: 0, no_listing: 0, ok: 0 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Analytics" title="Cross-Channel Opportunities" />

        {rows.length === 0 ? (
          <div className="rounded border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <p className="text-zinc-100">No data yet.</p>
            <p className="mt-2 text-sm text-zinc-400">Run the orders seed to populate revenue data:</p>
            <pre className="mx-auto mt-3 max-w-md rounded border border-zinc-800 bg-zinc-950 px-4 py-2 text-left text-xs text-zinc-300">
              cd apps/api{"\n"}npx tsx src/scripts/seed-orders.ts
            </pre>
          </div>
        ) : (
          <CrossChannelBoard rows={rows} counts={flagCounts} />
        )}
    </div>
  );
}

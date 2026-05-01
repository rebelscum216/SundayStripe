import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";

type ConnectionStatus = "connected" | "missing" | "partial";

type ConnectionIntegration = {
  key: "shopify" | "merchant" | "search_console" | "amazon_sp" | "openai";
  label: string;
  status: ConnectionStatus;
  detail: string;
  lastSyncedAt: string | null;
  openAlerts: number;
  missingSteps: string[];
};

type ConnectionsResponse = {
  integrations: ConnectionIntegration[];
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getConnections(): Promise<ConnectionIntegration[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/connections`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as ConnectionsResponse;
    return data.integrations;
  } catch {
    return [];
  }
}

const iconLabels: Record<ConnectionIntegration["key"], string> = {
  shopify: "SH",
  merchant: "GM",
  search_console: "GS",
  amazon_sp: "AZ",
  openai: "AI",
};

function statusToPill(status: ConnectionStatus) {
  if (status === "connected") return { status: "active" as const, label: "Connected" };
  if (status === "partial") return { status: "idle" as const, label: "Partial" };
  return { status: "missing" as const, label: "Missing" };
}

function formatRelativeTime(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  const [unit, unitMs] = units.find(([, ms]) => absMs >= ms) ?? ["minute", 60 * 1000];
  const amount = Math.round(diffMs / unitMs);

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(amount, unit);
}

export default async function SettingsPage() {
  const integrations = await getConnections();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="System" title="Connections" meta="Integration readiness" />

      <section className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => {
          const pill = statusToPill(integration.status);
          const relativeSync = formatRelativeTime(integration.lastSyncedAt);
          return (
            <article
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
              key={integration.key}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded border border-zinc-800 bg-zinc-950 font-mono text-xs font-semibold text-blue-400">
                    {iconLabels[integration.key]}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">{integration.label}</h2>
                    <p className="mt-0.5 text-xs text-zinc-400">{integration.detail}</p>
                  </div>
                </div>
                <StatusPill status={pill.status} label={pill.label} />
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
                {relativeSync && <span>Last synced {relativeSync}</span>}
                {integration.openAlerts > 0 && (
                  <span className="text-amber-400">
                    {integration.openAlerts} open alert{integration.openAlerts === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {integration.missingSteps.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-zinc-800 pt-3">
                  {integration.missingSteps.map((step) => (
                    <li className="text-xs text-amber-400" key={step}>
                      <span className="mr-2 text-amber-500">-</span>
                      {step}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}

        {integrations.length === 0 && (
          <div className="rounded border border-zinc-800 bg-zinc-900 px-6 py-10 text-sm text-zinc-400 lg:col-span-2">
            Connection readiness is unavailable.
          </div>
        )}
      </section>
    </div>
  );
}

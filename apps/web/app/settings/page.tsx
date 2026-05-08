import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import { SyncAllConnectionsButton, SyncConnectionButton } from "./connections-actions";

type ConnectionStatus = "connected" | "missing" | "partial";

type ConnectionIntegration = {
  key: "shopify" | "merchant" | "search_console" | "amazon_sp" | "openai";
  id: string | null;
  label: string;
  status: ConnectionStatus;
  detail: string;
  lastSyncedAt: string | null;
  openAlerts: number;
  capabilities: string[];
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
  const syncableIntegrationIds = integrations
    .map((integration) => integration.id)
    .filter((id): id is string => Boolean(id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="System" title="Connections" meta="Integration readiness">
        <SyncAllConnectionsButton integrationIds={syncableIntegrationIds} />
      </PageHeader>

      <section className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => {
          const pill = statusToPill(integration.status);
          const relativeSync = formatRelativeTime(integration.lastSyncedAt);
          return (
            <article
              className="ss-card"
              style={{ padding: 16 }}
              key={integration.key}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="ss-num flex h-9 w-9 items-center justify-center" style={{ borderRadius: 6, border: "1px solid var(--ss-line)", background: "var(--ss-bg-elev)", fontSize: 12, fontWeight: 600, color: "var(--ss-orange)" }}>
                    {iconLabels[integration.key]}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>{integration.label}</h2>
                    <p style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>{integration.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={pill.status} label={pill.label} />
                  {integration.id && <SyncConnectionButton integrationId={integration.id} />}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                {relativeSync && <span>Last synced {relativeSync}</span>}
                {integration.openAlerts > 0 && (
                  <span style={{ color: "var(--ss-amber-ink)" }}>
                    {integration.openAlerts} open alert{integration.openAlerts === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {integration.capabilities?.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {integration.capabilities.map((cap) => (
                    <li
                      key={cap}
                      className="ss-pill"
                      style={{ height: 18, fontSize: 10 }}
                    >
                      {cap}
                    </li>
                  ))}
                </ul>
              )}

              {integration.missingSteps.length > 0 && (
                <ul className="mt-4 space-y-1" style={{ borderTop: "1px solid var(--ss-line)", paddingTop: 12 }}>
                  {integration.missingSteps.map((step) => (
                    <li style={{ fontSize: 12, color: "var(--ss-amber-ink)" }} key={step}>
                      <span className="mr-2">-</span>
                      {step}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}

        {integrations.length === 0 && (
          <div className="ss-card lg:col-span-2" style={{ padding: "32px 24px", fontSize: 14, color: "var(--ss-ink-3)" }}>
            Connection readiness is unavailable.
          </div>
        )}
      </section>
    </div>
  );
}

import { PageHeader } from "../components/page-header";
import { AlertsList } from "./alerts-list";
import { TriagePanel } from "./triage-panel";

type Alert = {
  id: string;
  severity: string;
  category: string;
  sourcePlatform: string | null;
  entityRef: string | null;
  payloadJson: {
    title?: string;
    merchant_product_name?: string;
    offer_id?: string;
    issues?: { code?: string; description?: string; severity?: string; attribute?: string; resolution?: string }[];
    topic?: string;
    error?: string;
  } | null;
  status: string;
  createdAt: string;
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Alert[];
  } catch {
    return [];
  }
}

export default async function AlertsPage() {
  const alerts = await getAlerts();

  const criticalCount = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <PageHeader
          section="Workspace"
          title="Alerts"
          meta={`${alerts.length} open${criticalCount > 0 ? ` · ${criticalCount} high priority` : ""}`}
        />
      </div>

      {alerts.length > 0 && <TriagePanel alertCount={alerts.length} />}

      {alerts.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 px-6 py-12 text-center text-zinc-500">
          No open alerts.
        </div>
      ) : (
        <AlertsList alerts={alerts} />
      )}
    </div>
  );
}

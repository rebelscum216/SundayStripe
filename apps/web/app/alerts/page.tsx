import { resolveAlert } from "../actions";
import { PageHeader } from "../components/page-header";

type Severity = "critical" | "high" | "medium" | "low";

type Alert = {
  id: string;
  severity: string;
  category?: string;
  ruleName?: string | null;
  rule_name?: string | null;
  platform?: string | null;
  sourcePlatform?: string | null;
  source_platform?: string | null;
  productTitle?: string | null;
  product_title?: string | null;
  entityRef?: string | null;
  entity_ref?: string | null;
  payloadJson?: {
    title?: string;
    merchant_product_name?: string;
    offer_id?: string;
    issues?: { code?: string; description?: string; severity?: string; attribute?: string; resolution?: string }[];
    topic?: string;
    error?: string;
  } | null;
  payload_json?: Alert["payloadJson"];
  status: string;
  createdAt?: string;
  created_at?: string;
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

const severities: Severity[] = ["critical", "high", "medium", "low"];

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const platformLabels: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Merchant",
  search_console: "Search",
  amazon_sp: "Amazon",
};

async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Alert[];
  } catch {
    return [];
  }
}

function normalizeSeverity(value: string | null | undefined): Severity {
  return severities.includes(value as Severity) ? (value as Severity) : "low";
}

function getPayload(alert: Alert) {
  return alert.payloadJson ?? alert.payload_json ?? null;
}

function getPlatform(alert: Alert) {
  return alert.platform ?? alert.sourcePlatform ?? alert.source_platform ?? "unknown";
}

function getProductName(alert: Alert): string {
  const payload = getPayload(alert);
  return (
    alert.productTitle ??
    alert.product_title ??
    payload?.title ??
    payload?.merchant_product_name ??
    null
  ) ?? "";
}

function getEntityRef(alert: Alert): string | null {
  const payload = getPayload(alert);
  return (
    alert.entityRef ??
    alert.entity_ref ??
    payload?.offer_id ??
    null
  );
}

function getRuleName(alert: Alert) {
  const payload = getPayload(alert);
  const firstIssue = payload?.issues?.[0];
  return (
    alert.ruleName ??
    alert.rule_name ??
    firstIssue?.code ??
    firstIssue?.attribute ??
    payload?.topic ??
    alert.category ??
    "Alert rule"
  );
}

function formatSince(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function countSeverity(alerts: Alert[], severity: Severity) {
  return alerts.filter((alert) => normalizeSeverity(alert.severity) === severity).length;
}

function ResolveButton({ alertId }: { alertId: string }) {
  return (
    <form action={resolveAlert.bind(null, alertId)}>
      <button type="submit" className="ss-btn ss-btn-sm">
        Resolve
      </button>
    </form>
  );
}

export default async function AlertsPage() {
  const alerts = await getAlerts();
  const grouped = Object.fromEntries(
    severities.map((severity) => [
      severity,
      alerts.filter((alert) => normalizeSeverity(alert.severity) === severity),
    ]),
  ) as Record<Severity, Alert[]>;

  const criticalCount = countSeverity(alerts, "critical");
  const highCount = countSeverity(alerts, "high");
  const mediumLowCount = countSeverity(alerts, "medium") + countSeverity(alerts, "low");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        section="Workspace"
        title="Alerts"
        meta={`${alerts.length} open${criticalCount + highCount > 0 ? ` · ${criticalCount + highCount} high priority` : ""}`}
      />

      <section
        className="ss-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: 20,
          background:
            "linear-gradient(135deg, var(--ss-bg-card) 0%, color-mix(in oklab, var(--ss-red-soft) 35%, var(--ss-bg-card)) 100%)",
          borderColor: "var(--ss-red-soft)",
        }}
      >
        <div>
          <div style={{ color: "var(--ss-ink-3)", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Open alerts
          </div>
          <div
            className="ss-num"
            style={{
              color: "var(--ss-ink)",
              fontFamily: "var(--ss-font-display)",
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {alerts.length}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="ss-sev ss-sev-critical" />
            <span style={{ color: "var(--ss-ink-3)", fontSize: 12 }}>Critical</span>
            <span className="ss-num" style={{ color: "var(--ss-ink)", fontSize: 13, fontWeight: 600 }}>{criticalCount}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="ss-sev ss-sev-high" />
            <span style={{ color: "var(--ss-ink-3)", fontSize: 12 }}>High</span>
            <span className="ss-num" style={{ color: "var(--ss-ink)", fontSize: 13, fontWeight: 600 }}>{highCount}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="ss-sev ss-sev-medium" />
            <span style={{ color: "var(--ss-ink-3)", fontSize: 12 }}>Medium + low</span>
            <span className="ss-num" style={{ color: "var(--ss-ink)", fontSize: 13, fontWeight: 600 }}>{mediumLowCount}</span>
          </div>
        </div>
      </section>

      {alerts.length === 0 ? (
        <div
          className="ss-card"
          style={{ padding: 24, textAlign: "center", color: "var(--ss-ink-3)", fontSize: 13 }}
        >
          No open alerts.
        </div>
      ) : (
        severities.map((severity) => {
          const rows = grouped[severity];
          if (rows.length === 0) return null;

          return (
            <section key={severity} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`ss-sev ss-sev-${severity}`} />
                <h2
                  style={{
                    color: "var(--ss-ink)",
                    fontFamily: "var(--ss-font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {severityLabels[severity]}
                </h2>
                <span className="ss-pill">{rows.length}</span>
              </div>

              <div className="ss-card" style={{ overflowX: "auto" }}>
                <table className="ss-tbl" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Channel</th>
                      <th>Rule</th>
                      <th>Since</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((alert) => {
                      const platform = getPlatform(alert);
                      const productName = getProductName(alert);
                      const entityRef = getEntityRef(alert);
                      const displayName = productName || entityRef || "Unknown product";
                      const showRef = entityRef && entityRef !== displayName;
                      return (
                        <tr key={alert.id}>
                          <td>
                            <div style={{ fontWeight: 500, color: "var(--ss-ink)", fontSize: 13 }}>{displayName}</div>
                            {showRef && (
                              <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-4)", marginTop: 2 }}>{entityRef}</div>
                            )}
                          </td>
                          <td>
                            <span className="ss-pill">
                              {platformLabels[platform] ?? platform}
                            </span>
                          </td>
                          <td style={{ color: "var(--ss-ink-2)" }}>{getRuleName(alert)}</td>
                          <td className="ss-num" style={{ color: "var(--ss-ink-3)", fontSize: 12 }}>
                            {formatSince(alert.createdAt ?? alert.created_at)}
                          </td>
                          <td>
                            <ResolveButton alertId={alert.id} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

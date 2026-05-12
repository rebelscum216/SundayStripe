import { TopbarSearch } from "../components/topbar-search";
import { ClearFailedJobsButton, ClearPendingJobsButton, SyncNowButton } from "./operations-actions";

type IntegrationStatus = {
  id?: string;
  platform: string;
  shopDomain?: string | null;
  shop_domain?: string | null;
  status: string;
  lastSyncedAt?: string | null;
  last_synced_at?: string | null;
  productCount?: number;
  product_count?: number;
  variantCount?: number;
  variant_count?: number;
  pendingJobs?: number;
  pending_jobs?: number;
  failedJobs?: number;
  failed_jobs?: number;
  openAlerts?: number;
  open_alerts?: number;
};

type StatusResponse = {
  ok: boolean;
  integrations: IntegrationStatus[];
};

type FailedJob = {
  id: string;
  integrationAccountId: string;
  platform: string;
  shopDomain: string | null;
  jobType: string;
  state: string;
  retryCount: number;
  payloadJson: unknown;
  errorJson: unknown;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getStatus(): Promise<StatusResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/status`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as StatusResponse;
  } catch { return null; }
}

async function getFailedJobs(): Promise<FailedJob[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/operations/jobs/failed`, { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as FailedJob[];
  } catch { return []; }
}

const platformLabels: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Google Merchant",
  search_console: "Search Console",
  amazon_sp: "Amazon",
};

type PillStatus = "active" | "syncing" | "error" | "idle" | "missing";

function normalizeStatus(status: string, pendingJobs: number): PillStatus {
  if (pendingJobs > 0) return "syncing";
  if (status === "active" || status === "syncing" || status === "error" || status === "idle") {
    return status as PillStatus;
  }
  return "idle";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function fmtNum(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatJson(value: unknown) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function StatusBadge({ status }: { status: PillStatus }) {
  const map: Record<PillStatus, string> = {
    syncing: "ss-pill ss-pill-sage",
    active:  "ss-pill ss-pill-sage",
    error:   "ss-pill ss-pill-red",
    missing: "ss-pill ss-pill-amber",
    idle:    "ss-pill",
  };
  const labels: Record<PillStatus, string> = {
    syncing: "Syncing", active: "Active", error: "Error", missing: "Missing", idle: "Idle",
  };
  return <span className={map[status]}>{labels[status]}</span>;
}

export default async function OperationsPage() {
  const [status, failedJobRows] = await Promise.all([getStatus(), getFailedJobs()]);
  const integrations = status?.integrations ?? [];
  const totalFailedJobs = integrations.reduce(
    (t, i) => t + (i.failedJobs ?? i.failed_jobs ?? 0), 0,
  );
  const totalPendingJobs = integrations.reduce(
    (t, i) => t + (i.pendingJobs ?? i.pending_jobs ?? 0), 0,
  );

  return (
    <>
      {/* Topbar */}
      <div className="ss-page-topbar ss-topbar-blur sticky z-10 flex items-center gap-3 border-b"
        style={{ borderColor: "var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)" }}>
          Operations
        </div>
        <div style={{ fontSize: 13, color: "var(--ss-ink-3)" }}>
          <span style={{ margin: "0 6px", color: "var(--ss-ink-4)" }}>/</span>
          Integration health &amp; jobs
        </div>
        <div style={{ flex: 1 }} />
        <TopbarSearch />
        <ClearPendingJobsButton pendingJobs={totalPendingJobs} />
        <ClearFailedJobsButton failedJobs={totalFailedJobs} />
      </div>

      <div className="ss-content-stack">

        {/* Integration Health */}
        <div className="ss-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
            <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
              Integration Health
            </div>
            <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
              {integrations.length} connected platform{integrations.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="ss-tbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th style={{ textAlign: "right" }}>Products</th>
                  <th style={{ textAlign: "right" }}>Variants</th>
                  <th style={{ textAlign: "right" }}>Pending Jobs</th>
                  <th style={{ textAlign: "right" }}>Failed Jobs</th>
                  <th style={{ textAlign: "right" }}>Open Alerts</th>
                  <th style={{ textAlign: "right", width: 96 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {integrations.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>
                      No integrations returned by the API.
                    </td>
                  </tr>
                )}
                {integrations.map((integration) => {
                  const pendingJobs = integration.pendingJobs ?? integration.pending_jobs ?? 0;
                  const failedJobs  = integration.failedJobs  ?? integration.failed_jobs  ?? 0;
                  const openAlerts  = integration.openAlerts  ?? integration.open_alerts  ?? 0;
                  const rowStatus   = normalizeStatus(integration.status, pendingJobs);
                  return (
                    <tr key={integration.id ?? integration.platform}>
                      <td>
                        <div style={{ fontWeight: 500, color: "var(--ss-ink)", fontSize: 13 }}>
                          {platformLabels[integration.platform] ?? integration.platform}
                        </div>
                        {(integration.shopDomain ?? integration.shop_domain) && (
                          <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-4)", marginTop: 2 }}>
                            {integration.shopDomain ?? integration.shop_domain}
                          </div>
                        )}
                      </td>
                      <td><StatusBadge status={rowStatus} /></td>
                      <td className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                        {formatDate(integration.lastSyncedAt ?? integration.last_synced_at)}
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                        {fmtNum(integration.productCount ?? integration.product_count ?? 0)}
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                        {fmtNum(integration.variantCount ?? integration.variant_count ?? 0)}
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                        {fmtNum(pendingJobs)}
                      </td>
                      <td style={{ textAlign: "right", width: 96, whiteSpace: "nowrap" }}>
                        {failedJobs > 0 ? (
                          <a href="#failed-jobs" className="ss-num" style={{ color: "var(--ss-red)", fontSize: 13 }}>
                            {fmtNum(failedJobs)}
                          </a>
                        ) : (
                          <span className="ss-num" style={{ color: "var(--ss-ink-3)" }}>0</span>
                        )}
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>
                        {fmtNum(openAlerts)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {integration.id ? (
                          <SyncNowButton integrationId={integration.id} />
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ss-ink-4)" }}>Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Failed Jobs */}
        <div id="failed-jobs" className="ss-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
            <div>
              <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
                Failed Jobs
              </div>
              <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
                Recent failed sync jobs with captured payload and error details.
              </div>
            </div>
            <span className={`ss-pill ${failedJobRows.length > 0 ? "ss-pill-red" : ""}`}>
              {failedJobRows.length}
            </span>
          </div>
          {failedJobRows.length === 0 ? (
            <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>
              No failed jobs are currently recorded.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="ss-tbl" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Job</th>
                    <th style={{ textAlign: "right" }}>Retries</th>
                    <th>Created</th>
                    <th>Finished</th>
                    <th>Error</th>
                    <th>Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {failedJobRows.map((job) => (
                    <tr key={job.id} style={{ verticalAlign: "top" }}>
                      <td>
                        <div style={{ fontWeight: 500, color: "var(--ss-ink)", fontSize: 13 }}>
                          {platformLabels[job.platform] ?? job.platform}
                        </div>
                        {job.shopDomain && (
                          <div className="ss-num" style={{ fontSize: 11, color: "var(--ss-ink-4)", marginTop: 2 }}>
                            {job.shopDomain}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>{job.jobType}</div>
                        <div className="ss-num" style={{ fontSize: 10, color: "var(--ss-ink-4)", marginTop: 2 }}>{job.id}</div>
                      </td>
                      <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{job.retryCount}</td>
                      <td className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{formatDate(job.createdAt)}</td>
                      <td className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{formatDate(job.finishedAt)}</td>
                      <td style={{ maxWidth: 360 }}>
                        <pre style={{
                          maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap",
                          background: "var(--ss-red-soft)", border: "1px solid var(--ss-line)",
                          borderRadius: 6, padding: "8px 10px", fontSize: 11,
                          color: "var(--ss-red-ink)", fontFamily: "var(--ss-font-mono)", lineHeight: 1.5,
                        }}>
                          {formatJson(job.errorJson)}
                        </pre>
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <pre style={{
                          maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap",
                          background: "var(--ss-bg-elev)", border: "1px solid var(--ss-line)",
                          borderRadius: 6, padding: "8px 10px", fontSize: 11,
                          color: "var(--ss-ink-3)", fontFamily: "var(--ss-font-mono)", lineHeight: 1.5,
                        }}>
                          {formatJson(job.payloadJson)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  );
}

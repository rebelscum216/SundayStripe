import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import { ClearFailedJobsButton, SyncNowButton } from "./operations-actions";

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
  } catch {
    return null;
  }
}

async function getFailedJobs(): Promise<FailedJob[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/operations/jobs/failed`, { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as FailedJob[];
  } catch {
    return [];
  }
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
    return status;
  }
  return "idle";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatJson(value: unknown) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function OperationsPage() {
  const [status, failedJobRows] = await Promise.all([getStatus(), getFailedJobs()]);
  const integrations = status?.integrations ?? [];
  const totalFailedJobs = integrations.reduce(
    (total, integration) => total + (integration.failedJobs ?? integration.failed_jobs ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="System" title="Operations" />

      <section className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Integration Health</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Sync</th>
                <th className="px-4 py-3 text-right">Products</th>
                <th className="px-4 py-3 text-right">Variants</th>
                <th className="px-4 py-3 text-right">Pending Jobs</th>
                <th className="px-4 py-3 text-right">Failed Jobs</th>
                <th className="px-4 py-3 text-right">Open Alerts</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((integration) => {
                const pendingJobs = integration.pendingJobs ?? integration.pending_jobs ?? 0;
                const failedJobs = integration.failedJobs ?? integration.failed_jobs ?? 0;
                const rowStatus = normalizeStatus(integration.status, pendingJobs);
                return (
                  <tr
                    className="border-b border-zinc-800/60 hover:bg-zinc-800/40"
                    key={integration.id ?? integration.platform}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-100">
                        {platformLabels[integration.platform] ?? integration.platform}
                      </div>
                      {(integration.shopDomain ?? integration.shop_domain) && (
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">
                          {integration.shopDomain ?? integration.shop_domain}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={rowStatus}
                        label={rowStatus === "syncing" ? "Syncing" : undefined}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {formatDate(integration.lastSyncedAt ?? integration.last_synced_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatNumber(integration.productCount ?? integration.product_count ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatNumber(integration.variantCount ?? integration.variant_count ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatNumber(pendingJobs)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {failedJobs > 0 ? (
                        <a href="#failed-jobs" className="text-red-400 underline decoration-red-400/40 underline-offset-4 hover:text-red-300">
                          {formatNumber(failedJobs)}
                        </a>
                      ) : (
                        <span className="text-zinc-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">
                      {formatNumber(integration.openAlerts ?? integration.open_alerts ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {integration.id ? (
                        <SyncNowButton integrationId={integration.id} />
                      ) : (
                        <span className="text-xs text-zinc-500">Unavailable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {integrations.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-zinc-400" colSpan={9}>
                    No integrations returned by the API.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <ClearFailedJobsButton failedJobs={totalFailedJobs} />
      </div>

      <section id="failed-jobs" className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Failed Jobs</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Recent failed sync jobs with captured payload and error details.
            </p>
          </div>
          <span className="rounded border border-red-500 bg-red-950 px-2 py-0.5 font-mono text-xs text-red-400">
            {formatNumber(failedJobRows.length)}
          </span>
        </div>
        {failedJobRows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500">No failed jobs are currently recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs font-medium uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3 text-right">Retries</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Finished</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Payload</th>
                </tr>
              </thead>
              <tbody>
                {failedJobRows.map((job) => (
                  <tr key={job.id} className="border-b border-zinc-800/60 align-top hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-100">
                        {platformLabels[job.platform] ?? job.platform}
                      </div>
                      {job.shopDomain && (
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">{job.shopDomain}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-zinc-300">{job.jobType}</div>
                      <div className="mt-1 font-mono text-[10px] text-zinc-600">{job.id}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{job.retryCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{formatDate(job.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{formatDate(job.finishedAt)}</td>
                    <td className="max-w-[360px] px-4 py-3">
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-red-900/60 bg-red-950/20 p-2 text-xs leading-relaxed text-red-300">
                        {formatJson(job.errorJson)}
                      </pre>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs leading-relaxed text-zinc-400">
                        {formatJson(job.payloadJson)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

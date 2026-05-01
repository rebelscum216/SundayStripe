"use client";

import { useState } from "react";
import { AiExplainDrawerButton } from "./ai-explain-drawer";
import { resolveAlert } from "../actions";

type Issue = {
  code?: string;
  description?: string;
  severity?: string;
  attribute?: string;
  resolution?: string;
};

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
    issues?: Issue[];
    topic?: string;
    error?: string;
  } | null;
  status: string;
  createdAt: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify",
  merchant: "Google Merchant",
  search_console: "Search Console",
  amazon_sp: "Amazon",
};

const CATEGORY_LABELS: Record<string, string> = {
  listing_issue: "Listing issue",
  sync_lag: "Sync failure",
  inventory_drift: "Inventory drift",
  connector_error: "Connector error",
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-red-800/60",
  high: "border-red-800/40",
  info: "border-zinc-700/60",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "border-red-500 bg-red-950 text-red-400",
  high: "border-red-600/60 bg-red-950/60 text-red-400",
  info: "border-zinc-600 bg-zinc-800 text-zinc-400",
};

const ISSUE_SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  error: "text-orange-400",
  warning: "text-amber-400",
  suggestion: "text-zinc-500",
};

const PLATFORMS = ["shopify", "merchant", "search_console", "amazon_sp"] as const;
const SEVERITIES = ["critical", "high", "info"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string) {
  const date = new Date(value);
  let hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${hour}:${minute} ${period}`;
}

function AlertRow({ alert }: { alert: Alert }) {
  const payload = alert.payloadJson;
  const issues = payload?.issues ?? [];
  const title =
    payload?.title ?? payload?.merchant_product_name ?? alert.entityRef ?? "Unknown";
  const dismissAction = resolveAlert.bind(null, alert.id);

  return (
    <div
      className={`rounded border bg-zinc-900 p-4 ${SEVERITY_BORDER[alert.severity] ?? "border-zinc-700/60"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[alert.severity] ?? SEVERITY_BADGE.info}`}
            >
              {alert.severity}
            </span>
            <span className="text-xs text-zinc-500">
              {PLATFORM_LABELS[alert.sourcePlatform ?? ""] ?? alert.sourcePlatform}
              {" · "}
              {CATEGORY_LABELS[alert.category] ?? alert.category}
            </span>
          </div>
          <p className="font-medium text-zinc-100">{title}</p>
          {payload?.offer_id && (
            <p className="font-mono text-xs text-zinc-500">offer: {payload.offer_id}</p>
          )}
          {payload?.topic && (
            <p className="font-mono text-xs text-zinc-500">webhook: {payload.topic}</p>
          )}
          {payload?.error && (
            <p className="text-xs text-zinc-400">{payload.error}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-zinc-500">{formatDate(alert.createdAt)}</span>
          <form action={dismissAction}>
            <button
              type="submit"
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              Dismiss
            </button>
          </form>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-zinc-700/60 pt-3">
          {issues.map((issue, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${ISSUE_SEV_COLOR[String(issue.severity ?? "").toLowerCase()] ?? "text-zinc-400"}`}
                >
                  {issue.severity ?? "issue"}
                </span>
                {issue.attribute && (
                  <span className="font-mono text-xs text-zinc-500">{issue.attribute}</span>
                )}
              </div>
              {issue.description && (
                <p className="text-sm text-zinc-300">{issue.description}</p>
              )}
              {issue.resolution && (
                <p className="text-xs text-zinc-500">{issue.resolution}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <AiExplainDrawerButton alertId={alert.id} />
    </div>
  );
}

type Props = { alerts: Alert[] };

export function AlertsList({ alerts }: Props) {
  const [platform, setPlatform] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  const filtered = alerts.filter((a) => {
    if (platform !== "all" && a.sourcePlatform !== platform) return false;
    if (severity !== "all" && a.severity !== severity) return false;
    return true;
  });

  const byCategory: Record<string, Alert[]> = {};
  for (const a of filtered) {
    (byCategory[a.category] ??= []).push(a);
  }

  const chipBase = "rounded-full border px-3 py-1 text-xs transition-colors";
  const chipActive = "border-blue-500 bg-blue-950 text-blue-300";
  const chipIdle = "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200";

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPlatform("all")} className={`${chipBase} ${platform === "all" ? chipActive : chipIdle}`}>
            All platforms
          </button>
          {PLATFORMS.filter((p) => alerts.some((a) => a.sourcePlatform === p)).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`${chipBase} ${platform === p ? chipActive : chipIdle}`}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setSeverity("all")} className={`${chipBase} ${severity === "all" ? chipActive : chipIdle}`}>
            All severity
          </button>
          {SEVERITIES.filter((s) => alerts.some((a) => a.severity === s)).map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`${chipBase} ${severity === s ? chipActive : chipIdle}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No alerts match the current filters.</p>
      ) : (
        Object.entries(byCategory).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {CATEGORY_LABELS[category] ?? category}
              <span className="ml-2 font-mono font-normal normal-case tracking-normal text-zinc-600">
                {items.length}
              </span>
            </h2>
            {items.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

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

const SEVERITY_BORDER_COLOR: Record<string, string> = {
  critical: "var(--ss-red-soft)",
  high: "var(--ss-orange-soft)",
  info: "var(--ss-line)",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "ss-pill ss-pill-red",
  high: "ss-pill ss-pill-red",
  info: "ss-pill",
};

const ISSUE_SEV_COLOR: Record<string, string> = {
  critical: "var(--ss-red-ink)",
  error: "var(--ss-orange)",
  warning: "var(--ss-amber-ink)",
  suggestion: "var(--ss-ink-3)",
};

const PLATFORMS = ["shopify", "merchant", "search_console", "amazon_sp"] as const;
const SEVERITIES = ["critical", "high", "info"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
  const [expanded, setExpanded] = useState(false);

  const firstIssue = issues[0];
  const extraCount = issues.length - 1;

  return (
    <div
      className="ss-card"
      style={{
        padding: 16,
        borderColor:
          SEVERITY_BORDER_COLOR[alert.severity] ?? "var(--ss-line)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={SEVERITY_BADGE[alert.severity] ?? "ss-pill"}>
              {alert.severity}
            </span>
            <span style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
              {PLATFORM_LABELS[alert.sourcePlatform ?? ""] ??
                alert.sourcePlatform}
              {" · "}
              {CATEGORY_LABELS[alert.category] ?? alert.category}
            </span>
          </div>
          <p style={{ fontWeight: 500, color: "var(--ss-ink)" }}>{title}</p>
          {payload?.offer_id && (
            <p className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
              offer: {payload.offer_id}
            </p>
          )}
          {payload?.topic && (
            <p className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
              webhook: {payload.topic}
            </p>
          )}
          {payload?.error && (
            <p style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>{payload.error}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
            {formatDate(alert.createdAt)}
          </span>
          <form action={dismissAction}>
            <button type="submit" className="ss-btn ss-btn-sm">
              Mark resolved
            </button>
          </form>
        </div>
      </div>

      {firstIssue && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid var(--ss-line)" }}
        >
          <div className="flex items-start gap-2">
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color:
                  ISSUE_SEV_COLOR[
                    String(firstIssue.severity ?? "").toLowerCase()
                  ] ?? "var(--ss-ink-3)",
              }}
            >
              {firstIssue.severity ?? "issue"}
            </span>
            {firstIssue.attribute && (
              <span className="ss-num" style={{ flexShrink: 0, fontSize: 12, color: "var(--ss-ink-3)" }}>
                {firstIssue.attribute}
              </span>
            )}
            {firstIssue.description && (
              <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ss-ink-2)" }}>
                {firstIssue.description}
              </p>
            )}
          </div>
          {firstIssue.resolution && (
            <p style={{ marginTop: 4, fontSize: 12, color: "var(--ss-ink-3)" }}>
              {firstIssue.resolution}
            </p>
          )}

          {extraCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ss-btn ss-btn-sm mt-2"
                style={{ fontSize: 12 }}
              >
                {expanded
                  ? "Hide details"
                  : `+${extraCount} more ${extraCount === 1 ? "issue" : "issues"}`}
              </button>
              {expanded && (
                <ul
                  className="mt-2 space-y-2 pt-2"
                  style={{ borderTop: "1px solid var(--ss-line)" }}
                >
                  {issues.slice(1).map((issue, i) => (
                    <li key={i} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color:
                              ISSUE_SEV_COLOR[
                                String(issue.severity ?? "").toLowerCase()
                              ] ?? "var(--ss-ink-3)",
                          }}
                        >
                          {issue.severity ?? "issue"}
                        </span>
                        {issue.attribute && (
                          <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                            {issue.attribute}
                          </span>
                        )}
                      </div>
                      {issue.description && (
                        <p style={{ fontSize: 12, color: "var(--ss-ink-2)" }}>
                          {issue.description}
                        </p>
                      )}
                      {issue.resolution && (
                        <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                          {issue.resolution}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
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

  const activeStyle = {
    borderColor: "var(--ss-orange-soft)",
    background: "var(--ss-orange-soft)",
    color: "var(--ss-orange-ink)",
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPlatform("all")}
            className="ss-btn ss-btn-sm"
            style={platform === "all" ? activeStyle : undefined}
          >
            All platforms
          </button>
          {PLATFORMS.filter((p) => alerts.some((a) => a.sourcePlatform === p)).map(
            (p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className="ss-btn ss-btn-sm"
                style={platform === p ? activeStyle : undefined}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSeverity("all")}
            className="ss-btn ss-btn-sm"
            style={severity === "all" ? activeStyle : undefined}
          >
            All severity
          </button>
          {SEVERITIES.filter((s) => alerts.some((a) => a.severity === s)).map(
            (s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className="ss-btn ss-btn-sm"
                style={severity === s ? activeStyle : undefined}
              >
                {s}
              </button>
            ),
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p
          className="py-8 text-center"
          style={{ fontSize: 13, color: "var(--ss-ink-3)" }}
        >
          No alerts match the current filters.
        </p>
      ) : (
        Object.entries(byCategory).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-2">
            <h2
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ss-ink-3)",
              }}
            >
              {CATEGORY_LABELS[category] ?? category}
              <span
                className="ss-num"
                style={{
                  marginLeft: 8,
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "var(--ss-ink-4)",
                }}
              >
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

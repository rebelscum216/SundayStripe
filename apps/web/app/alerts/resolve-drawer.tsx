"use client";

import Link from "next/link";
import { useTransition } from "react";
import { resolveAlert } from "../actions";
import { useDrawer } from "../components/drawer-context";

type EnforcementAction = { action?: string };
type Issue = {
  code?: string;
  message?: string;
  severity?: string;
  attributeNames?: string[];
  categories?: string[];
  enforcements?: { actions?: EnforcementAction[] };
  description?: string;
  attribute?: string;
  resolution?: string;
};

const CATEGORY_HINT: Record<string, string> = {
  MISSING_ATTRIBUTE: "Add the missing attribute(s) to your listing.",
  INVALID_VALUE: "Correct the invalid attribute value in your listing.",
  UNRECOGNIZED_VALUE: "Replace the unrecognized value with a valid option.",
  BELOW_THRESHOLD_VALUE: "Increase the value to meet Amazon's minimum requirement.",
  CONFLICT: "Resolve the conflicting attribute values.",
};

const ACTION_LABEL: Record<string, string> = {
  SEARCH_SUPPRESSED: "Search suppressed",
  DETAIL_PAGE_REMOVED: "Detail page removed",
  BUYABILITY_SUSPENDED: "Buyability suspended",
  GRADING_REQUIRED: "Grading required",
};

export type ResolveAlertInfo = {
  id: string;
  productTitle: string;
  entityRef: string | null;
  platform: string;
  ruleName: string;
  issues: Issue[];
  productId: string | null;
};

const ISSUE_SEV_COLOR: Record<string, string> = {
  critical: "var(--ss-red-ink)",
  error: "var(--ss-orange)",
  warning: "var(--ss-amber-ink)",
  suggestion: "var(--ss-ink-3)",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--ss-ink-3)",
};

function ResolveContent({ alert }: { alert: ResolveAlertInfo }) {
  const { close } = useDrawer();
  const [isPending, startTransition] = useTransition();

  function handleResolve() {
    startTransition(async () => {
      await resolveAlert(alert.id);
      close();
    });
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p style={labelStyle}>Resolving alert</p>
        <p style={{ marginTop: 4, fontWeight: 600, color: "var(--ss-ink)" }}>
          {alert.productTitle}
        </p>
        {alert.entityRef && (
          <p className="ss-num" style={{ marginTop: 2, fontSize: 12, color: "var(--ss-ink-3)" }}>
            {alert.entityRef}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="ss-pill">{alert.platform}</span>
          <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
            {alert.ruleName}
          </span>
        </div>
      </div>

      {alert.issues.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p style={labelStyle}>
            {alert.issues.length} {alert.issues.length === 1 ? "Issue" : "Issues"}
          </p>
          {alert.issues.map((issue, i) => {
            const body = issue.message ?? issue.description;
            const attrs = issue.attributeNames?.length
              ? issue.attributeNames.join(", ")
              : (issue.attribute ?? null);
            const hint =
              issue.resolution ??
              (issue.categories?.[0] ? CATEGORY_HINT[issue.categories[0]] : null);
            const impacts =
              issue.enforcements?.actions
                ?.map((a) =>
                  a.action
                    ? (ACTION_LABEL[a.action] ??
                      a.action.replace(/_/g, " ").toLowerCase())
                    : null,
                )
                .filter(Boolean) ?? [];

            return (
              <div
                key={i}
                className="ss-card flex flex-col gap-1.5"
                style={{ padding: 12 }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {issue.severity && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color:
                          ISSUE_SEV_COLOR[issue.severity.toLowerCase()] ??
                          "var(--ss-ink-3)",
                      }}
                    >
                      {issue.severity}
                    </span>
                  )}
                  {attrs && (
                    <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                      {attrs}
                    </span>
                  )}
                  {impacts.map((label, j) => (
                    <span key={j} className="ss-pill ss-pill-red">
                      {label}
                    </span>
                  ))}
                </div>
                {body && (
                  <p style={{ lineHeight: 1.55, color: "var(--ss-ink)" }}>{body}</p>
                )}
                {hint && alert.productId ? (
                  <Link
                    href={`/products/${alert.productId}#open-issues`}
                    onClick={close}
                    className="block"
                    style={{
                      marginTop: 2,
                      paddingTop: 6,
                      borderTop: "1px solid var(--ss-line)",
                      fontSize: 12,
                      color: "var(--ss-orange-ink)",
                    }}
                  >
                    → {hint}
                  </Link>
                ) : hint ? (
                  <p
                    style={{
                      marginTop: 2,
                      paddingTop: 6,
                      borderTop: "1px solid var(--ss-line)",
                      fontSize: 12,
                      color: "var(--ss-ink-3)",
                    }}
                  >
                    → {hint}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
          No issue details available for this alert.
        </p>
      )}

      <div
        className="flex flex-col gap-2 pt-3"
        style={{ borderTop: "1px solid var(--ss-line)" }}
      >
        {alert.productId && (
          <Link
            href={`/products/${alert.productId}`}
            onClick={close}
            className="ss-btn"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            View product page →
          </Link>
        )}
        <button
          type="button"
          onClick={handleResolve}
          disabled={isPending}
          className="ss-btn ss-btn-primary disabled:opacity-50"
        >
          {isPending ? "Resolving…" : "Mark Resolved"}
        </button>
        <button
          type="button"
          onClick={close}
          className="ss-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ResolveDrawerButton({ alert }: { alert: ResolveAlertInfo }) {
  const { open } = useDrawer();

  return (
    <button
      type="button"
      onClick={() => open(<ResolveContent alert={alert} />)}
      className="ss-btn ss-btn-sm"
    >
      Resolve
    </button>
  );
}

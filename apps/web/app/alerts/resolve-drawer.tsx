"use client";

import Link from "next/link";
import { useTransition } from "react";
import { resolveAlert } from "../actions";
import { useDrawer } from "../components/drawer-context";

type EnforcementAction = { action?: string };
type Issue = {
  // Amazon SP-API shape
  code?: string;
  message?: string;
  severity?: string;
  attributeNames?: string[];
  categories?: string[];
  enforcements?: { actions?: EnforcementAction[] };
  // Merchant / legacy shape
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
  critical: "text-red-400",
  error: "text-orange-400",
  warning: "text-amber-400",
  suggestion: "text-zinc-500",
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
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Resolving alert</p>
        <p className="mt-1 font-semibold text-zinc-100">{alert.productTitle}</p>
        {alert.entityRef && (
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{alert.entityRef}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
            {alert.platform}
          </span>
          <span className="font-mono text-xs text-zinc-500">{alert.ruleName}</span>
        </div>
      </div>

      {alert.issues.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {alert.issues.length} {alert.issues.length === 1 ? "Issue" : "Issues"}
          </p>
          {alert.issues.map((issue, i) => {
            const body = issue.message ?? issue.description;
            const attrs = issue.attributeNames?.length
              ? issue.attributeNames.join(", ")
              : (issue.attribute ?? null);
            const hint = issue.resolution
              ?? (issue.categories?.[0] ? CATEGORY_HINT[issue.categories[0]] : null);
            const impacts = issue.enforcements?.actions
              ?.map((a) => a.action ? (ACTION_LABEL[a.action] ?? a.action.replace(/_/g, " ").toLowerCase()) : null)
              .filter(Boolean) ?? [];

            return (
              <div key={i} className="flex flex-col gap-1.5 rounded border border-zinc-700 bg-zinc-800 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {issue.severity && (
                    <span className={`text-xs font-semibold uppercase tracking-wide ${ISSUE_SEV_COLOR[issue.severity.toLowerCase()] ?? "text-zinc-400"}`}>
                      {issue.severity}
                    </span>
                  )}
                  {attrs && (
                    <span className="font-mono text-xs text-zinc-400">{attrs}</span>
                  )}
                  {impacts.map((label, j) => (
                    <span key={j} className="rounded bg-red-950 px-1.5 py-0.5 text-xs font-medium text-red-400">
                      {label}
                    </span>
                  ))}
                </div>
                {body && (
                  <p className="leading-relaxed text-zinc-200">{body}</p>
                )}
                {hint && alert.productId ? (
                  <Link
                    href={`/products/${alert.productId}#open-issues`}
                    onClick={close}
                    className="mt-0.5 border-t border-zinc-700 pt-1.5 text-xs text-blue-400 hover:text-blue-300 block"
                  >
                    → {hint}
                  </Link>
                ) : hint ? (
                  <p className="mt-0.5 border-t border-zinc-700 pt-1.5 text-xs text-zinc-400">
                    → {hint}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No issue details available for this alert.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
        {alert.productId && (
          <Link
            href={`/products/${alert.productId}`}
            onClick={close}
            className="flex items-center justify-center rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-100"
          >
            View product page →
          </Link>
        )}
        <button
          type="button"
          onClick={handleResolve}
          disabled={isPending}
          className="rounded border border-emerald-700 bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? "Resolving…" : "Mark Resolved"}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
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

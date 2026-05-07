"use client";

import { useTransition } from "react";
import { clearFailedJobs, triggerSync } from "../actions";

export function SyncNowButton({ integrationId }: { integrationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => void triggerSync(integrationId))}
      className="ss-btn ss-btn-primary ss-btn-sm"
    >
      {isPending ? "Syncing…" : "Sync Now"}
    </button>
  );
}

export function ClearFailedJobsButton({ failedJobs }: { failedJobs: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending || failedJobs === 0}
      onClick={() => startTransition(() => void clearFailedJobs())}
      className="ss-btn ss-btn-sm"
      style={{ opacity: failedJobs === 0 ? 0.4 : 1 }}
    >
      Clear Failed Jobs
      {failedJobs > 0 && (
        <span className="ss-pill ss-pill-red" style={{ height: 16, fontSize: 10, padding: "0 5px" }}>
          {failedJobs}
        </span>
      )}
    </button>
  );
}

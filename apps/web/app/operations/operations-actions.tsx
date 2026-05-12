"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearFailedJobs, clearPendingJobs, triggerSync } from "../actions";

export function SyncNowButton({ integrationId }: { integrationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => { await triggerSync(integrationId); router.refresh(); })}
      className="ss-btn ss-btn-primary ss-btn-sm"
      style={{ minWidth: 78, whiteSpace: "nowrap" }}
    >
      {isPending ? "Syncing..." : "Sync Now"}
    </button>
  );
}

export function ClearFailedJobsButton({ failedJobs }: { failedJobs: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending || failedJobs === 0}
      onClick={() => startTransition(async () => { await clearFailedJobs(); router.refresh(); })}
      className="ss-btn ss-btn-sm"
      style={{ opacity: failedJobs === 0 ? 0.4 : 1 }}
    >
      {isPending ? "Clearing..." : "Clear Failed Jobs"}
      {!isPending && failedJobs > 0 && (
        <span className="ss-pill ss-pill-red" style={{ height: 16, fontSize: 10, padding: "0 5px" }}>
          {failedJobs}
        </span>
      )}
    </button>
  );
}

export function ClearPendingJobsButton({ pendingJobs }: { pendingJobs: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending || pendingJobs === 0}
      onClick={() => startTransition(async () => { await clearPendingJobs(); router.refresh(); })}
      className="ss-btn ss-btn-sm"
      style={{ opacity: pendingJobs === 0 ? 0.4 : 1 }}
    >
      {isPending ? "Clearing..." : "Clear Stuck Jobs"}
      {!isPending && pendingJobs > 0 && (
        <span className="ss-pill ss-pill-amber" style={{ height: 16, fontSize: 10, padding: "0 5px" }}>
          {pendingJobs}
        </span>
      )}
    </button>
  );
}

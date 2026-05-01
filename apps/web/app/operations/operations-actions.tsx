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
      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
    >
      {isPending ? "Syncing..." : "Sync Now"}
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
      className="inline-flex items-center gap-2 rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Clear Failed Jobs
      {failedJobs > 0 && (
        <span className="rounded border border-red-500 bg-red-950 px-1.5 py-0.5 font-mono text-[10px] text-red-400">
          {failedJobs}
        </span>
      )}
    </button>
  );
}

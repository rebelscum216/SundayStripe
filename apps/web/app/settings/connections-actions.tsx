"use client";

import { useTransition } from "react";
import { triggerSync, triggerSyncMany } from "../actions";

export function SyncConnectionButton({ integrationId }: { integrationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => void triggerSync(integrationId))}
      className="ss-btn ss-btn-sm"
    >
      {isPending ? "Syncing..." : "Sync now"}
    </button>
  );
}

export function SyncAllConnectionsButton({ integrationIds }: { integrationIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || integrationIds.length === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => startTransition(() => void triggerSyncMany(integrationIds))}
      className="ss-btn ss-btn-primary"
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      {isPending ? "Syncing..." : "Sync connected"}
    </button>
  );
}

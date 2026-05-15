"use client";

import { useState, useTransition } from "react";
import { triggerSync, triggerSyncMany } from "../actions";

export function SyncConnectionButton({ integrationId }: { integrationId: string }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "queued" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleClick() {
    setState("idle");
    setErrorMsg(null);
    startTransition(async () => {
      try {
        await triggerSync(integrationId);
        setState("queued");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Sync failed");
        setState("error");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="ss-btn ss-btn-sm"
      >
        {isPending ? "Starting..." : state === "queued" ? "Queued ✓" : "Sync now"}
      </button>
      {state === "error" && errorMsg && (
        <span style={{ fontSize: 10, color: "var(--ss-red, #c0392b)", maxWidth: 160, textAlign: "right" }}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}

export function SyncAllConnectionsButton({ integrationIds }: { integrationIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "queued" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const disabled = isPending || integrationIds.length === 0;

  function handleClick() {
    setState("idle");
    setErrorMsg(null);
    startTransition(async () => {
      try {
        await triggerSyncMany(integrationIds);
        setState("queued");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Sync failed");
        setState("error");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="ss-btn ss-btn-primary"
        style={{ opacity: disabled ? 0.55 : 1 }}
      >
        {isPending ? "Starting..." : state === "queued" ? "All queued ✓" : "Sync connected"}
      </button>
      {state === "error" && errorMsg && (
        <span style={{ fontSize: 10, color: "var(--ss-red, #c0392b)", maxWidth: 200, textAlign: "right" }}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}

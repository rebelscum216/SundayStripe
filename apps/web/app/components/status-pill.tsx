type StatusPillProps = {
  status: "active" | "syncing" | "error" | "idle" | "missing";
  label?: string;
};

const pillClass: Record<string, string> = {
  active:  "ss-pill ss-pill-sage",
  syncing: "ss-pill ss-pill-sage",
  error:   "ss-pill ss-pill-red",
  missing: "ss-pill ss-pill-amber",
  idle:    "ss-pill",
};

const statusLabels: Record<string, string> = {
  active: "Active", syncing: "Syncing", error: "Error", idle: "Idle", missing: "Missing",
};

export function StatusPill({ status, label }: StatusPillProps) {
  return (
    <span className={pillClass[status] ?? "ss-pill"}>
      {label ?? statusLabels[status] ?? status}
    </span>
  );
}

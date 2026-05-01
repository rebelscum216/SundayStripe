type StatusPillProps = {
  status: "active" | "syncing" | "error" | "idle" | "missing";
  label?: string;
};

const statusClasses = {
  active: "border-emerald-500 bg-emerald-950 text-emerald-400",
  syncing: "border-blue-500 bg-blue-950 text-blue-400",
  error: "border-red-500 bg-red-950 text-red-400",
  idle: "border-zinc-700 bg-zinc-900 text-zinc-400",
  missing: "border-amber-500 bg-amber-950 text-amber-400",
};

const statusLabels = {
  active: "Active",
  syncing: "Syncing",
  error: "Error",
  idle: "Idle",
  missing: "Missing",
};

export function StatusPill({ status, label }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${statusClasses[status]}`}
    >
      {label ?? statusLabels[status]}
    </span>
  );
}

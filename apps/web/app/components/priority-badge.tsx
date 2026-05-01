type PriorityBadgeProps = {
  priority: "critical" | "high" | "medium" | "low";
};

const priorityClasses = {
  critical: "border-red-500 bg-red-950 text-red-400",
  high: "border-orange-500 bg-orange-950 text-orange-400",
  medium: "border-amber-500 bg-amber-950 text-amber-400",
  low: "border-zinc-700 bg-zinc-900 text-zinc-400",
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityClasses[priority]}`}
    >
      {priority}
    </span>
  );
}

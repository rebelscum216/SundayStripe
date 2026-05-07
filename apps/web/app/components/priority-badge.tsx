type PriorityBadgeProps = {
  priority: "critical" | "high" | "medium" | "low";
};

const priorityClasses = {
  critical: "ss-pill-red",
  high: "ss-pill-orange",
  medium: "ss-pill-amber",
  low: "",
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span className={`ss-pill ${priorityClasses[priority]}`}>
      {priority}
    </span>
  );
}

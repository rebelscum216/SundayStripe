type ChannelBadgeProps = {
  platform: "shopify" | "merchant" | "amazon_sp" | "search_console";
  status?: string;
};

const platformLabels = {
  shopify: "Shopify",
  merchant: "Merchant",
  amazon_sp: "Amazon",
  search_console: "GSC",
};

const statusStyles: Record<string, string> = {
  published: "border-emerald-700 bg-emerald-950/60 text-emerald-300",
  active:    "border-emerald-700 bg-emerald-950/60 text-emerald-300",
  disapproved: "border-red-700 bg-red-950/60 text-red-300",
  issue:     "border-amber-700 bg-amber-950/60 text-amber-300",
  unlisted:  "border-zinc-700 bg-zinc-800 text-zinc-400",
};

const statusDot: Record<string, string> = {
  published:   "bg-emerald-400",
  active:      "bg-emerald-400",
  disapproved: "bg-red-400",
  issue:       "bg-amber-400",
  unlisted:    "bg-zinc-500",
};

export function ChannelBadge({ platform, status }: ChannelBadgeProps) {
  const style = status ? (statusStyles[status] ?? "border-zinc-700 bg-zinc-800 text-zinc-400") : "border-zinc-800 bg-zinc-900 text-zinc-100";
  const dot = status ? (statusDot[status] ?? "bg-zinc-500") : null;

  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium ${style}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {platformLabels[platform]}
    </span>
  );
}

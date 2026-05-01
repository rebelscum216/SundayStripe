type ChannelBadgeProps = {
  platform: "shopify" | "merchant" | "amazon_sp" | "search_console";
};

const platformLabels = {
  shopify: "Shopify",
  merchant: "Merchant",
  amazon_sp: "Amazon",
  search_console: "GSC",
};

export function ChannelBadge({ platform }: ChannelBadgeProps) {
  return (
    <span className="inline-flex items-center border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-100">
      {platformLabels[platform]}
    </span>
  );
}

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
  published: "ss-pill-sage",
  active: "ss-pill-sage",
  disapproved: "ss-pill-red",
  issue: "ss-pill-amber",
  unlisted: "",
};

const statusDot: Record<string, string> = {
  published: "var(--ss-sage-ink)",
  active: "var(--ss-sage-ink)",
  disapproved: "var(--ss-red-ink)",
  issue: "var(--ss-amber-ink)",
  unlisted: "var(--ss-ink-3)",
};

export function ChannelBadge({ platform, status }: ChannelBadgeProps) {
  const style = status ? (statusStyles[status] ?? "") : "";
  const dot = status ? (statusDot[status] ?? "var(--ss-ink-3)") : null;

  return (
    <span className={`ss-pill ${style}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
      {platformLabels[platform]}
    </span>
  );
}

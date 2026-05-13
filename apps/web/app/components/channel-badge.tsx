type ChannelBadgeProps = {
  platform: "shopify" | "merchant" | "amazon_sp" | "search_console";
  status?: string;
  suppressed?: boolean;
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
  unlisted: "ss-pill-amber",
};

const statusDot: Record<string, string> = {
  published: "var(--ss-sage-ink)",
  active: "var(--ss-sage-ink)",
  disapproved: "var(--ss-red-ink)",
  issue: "var(--ss-amber-ink)",
  unlisted: "var(--ss-amber-ink)",
};

const statusTooltip: Record<string, string> = {
  unlisted: "Exists on platform but not purchasable — check listing quality",
  suppressed: "Published but not buyable",
};

export function ChannelBadge({ platform, status, suppressed }: ChannelBadgeProps) {
  const effectiveStatus = suppressed ? "suppressed" : status;
  const style = suppressed ? "ss-pill-amber" : (status ? (statusStyles[status] ?? "") : "");
  const dot = suppressed ? "var(--ss-amber-ink)" : (status ? (statusDot[status] ?? "var(--ss-ink-3)") : null);

  const tooltip = suppressed
    ? statusTooltip.suppressed
    : (status ? (statusTooltip[status] ?? effectiveStatus) : undefined);

  return (
    <span className={`ss-pill ${style}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={tooltip}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
      {platformLabels[platform]}{suppressed ? " (suppressed)" : ""}
    </span>
  );
}

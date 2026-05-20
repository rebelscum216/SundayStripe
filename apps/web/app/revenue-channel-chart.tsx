"use client";

type RevenueByChannelRow = {
  month: string;
  shopifyCents: number;
  amazonCents: number;
};

type Props = {
  data: RevenueByChannelRow[];
};

function currency(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function RevenueChannelChart({ data }: Props) {
  if (data.length === 0) return null;

  const maxCents = Math.max(...data.map((r) => r.shopifyCents + r.amazonCents), 1);
  const chartH = 160;
  const barW = 20;
  const gap = 12;
  const padL = 64;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const totalW = padL + data.length * (barW + gap) - gap + padR;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    fraction: f,
    y: padT + chartH - f * chartH,
    label: currency(maxCents * f),
  }));

  return (
    <div className="ss-card" style={{ padding: 16 }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, color: "var(--ss-ink)" }}>
            Revenue by Channel
          </h2>
          <p style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>Monthly tracked revenue, stacked by source.</p>
        </div>
        <div className="flex items-center gap-3" style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--ss-sage)", marginRight: 5 }} />Shopify</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--ss-orange)", marginRight: 5 }} />Amazon</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${totalW} ${padT + chartH + padB}`}
          style={{ width: "100%", minWidth: totalW, display: "block" }}
        >
          {/* Grid lines + Y-axis labels */}
          {yTicks.map((t) => (
            <g key={t.fraction}>
              <line x1={padL} x2={totalW - padR} y1={t.y} y2={t.y} stroke="var(--ss-line)" strokeWidth={1} />
              <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="var(--ss-ink-3)">{t.label}</text>
            </g>
          ))}

          {/* Bars */}
          {data.map((row, i) => {
            const x = padL + i * (barW + gap);
            const shopifyH = (row.shopifyCents / maxCents) * chartH;
            const amazonH = (row.amazonCents / maxCents) * chartH;
            const totalH = shopifyH + amazonH;
            const baseY = padT + chartH;
            return (
              <g key={row.month}>
                {/* Shopify (bottom) */}
                {shopifyH > 0 && (
                  <rect x={x} y={baseY - shopifyH} width={barW} height={shopifyH} fill="var(--ss-sage)" rx={amazonH > 0 ? 0 : 3} />
                )}
                {/* Amazon (top) */}
                {amazonH > 0 && (
                  <rect x={x} y={baseY - totalH} width={barW} height={amazonH} fill="var(--ss-orange)" rx={3} />
                )}
                {/* X label */}
                <text x={x + barW / 2} y={baseY + 14} textAnchor="middle" fontSize={10} fill="var(--ss-ink-3)">
                  {monthLabel(row.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

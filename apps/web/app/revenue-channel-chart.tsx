"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RevenueByChannelRow = {
  month: string;
  shopifyCents: number;
  amazonCents: number;
};

type Props = {
  data: RevenueByChannelRow[];
};

function currency(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function RevenueChannelChart({ data }: Props) {
  if (data.length === 0) return null;

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
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--ss-line)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fill: "var(--ss-ink-3)", fontSize: 12 }}
              axisLine={{ stroke: "var(--ss-line)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => currency(Number(value))}
              tick={{ fill: "var(--ss-ink-3)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              formatter={(value, name) => [currency(Number(value)), name === "shopifyCents" ? "Shopify" : "Amazon"]}
              labelFormatter={(label) => label}
              contentStyle={{
                background: "var(--ss-bg-card)",
                border: "1px solid var(--ss-line)",
                borderRadius: 8,
                color: "var(--ss-ink)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="shopifyCents" stackId="channel" fill="var(--ss-sage)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="amazonCents" stackId="channel" fill="var(--ss-orange)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

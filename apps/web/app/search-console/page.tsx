import Link from "next/link";
import { TopbarSearch } from "../components/topbar-search";
import { AlmostPage1Table, type AlmostPage1Row } from "./almost-page-1-table";
import { QuickWinsTable } from "./quick-wins-table";

type GscSummary = { clicks: number; impressions: number; ctr: number; position: number; row_count: number };
type BrandedFilter = "all" | "true" | "false";
type GscRow = { query?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number; isBranded?: boolean };
type QueryPageEntry = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type ProductPageGroup = { url: string; clicks: number; impressions: number; queries: QueryPageEntry[] };

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getSummary(): Promise<GscSummary | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/summary`, { cache: "no-store" });
    return res.ok ? (await res.json()) as GscSummary : null;
  } catch { return null; }
}
async function getQueries(branded: BrandedFilter): Promise<GscRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/queries?branded=${branded}`, { cache: "no-store" });
    return res.ok ? (await res.json()) as GscRow[] : [];
  } catch { return []; }
}
async function getPages(): Promise<GscRow[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/pages`, { cache: "no-store" });
    return res.ok ? (await res.json()) as GscRow[] : [];
  } catch { return []; }
}
async function getAlmostPage1(branded: BrandedFilter): Promise<AlmostPage1Row[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/almost-page-1?branded=${branded}`, { cache: "no-store" });
    return res.ok ? (await res.json()) as AlmostPage1Row[] : [];
  } catch { return []; }
}
async function getByProductPage(): Promise<ProductPageGroup[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/search-console/by-product-page`, { cache: "no-store" });
    return res.ok ? (await res.json()) as ProductPageGroup[] : [];
  } catch { return []; }
}

function fmtNum(n: number) { return new Intl.NumberFormat("en").format(n); }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmtNum(n); }

function normalizeBranded(value: string | string[] | undefined): BrandedFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "true" || raw === "false" || raw === "all" ? raw : "all";
}

function positionColor(p: number) {
  if (p <= 3) return "var(--ss-sage-ink)";
  if (p <= 10) return "var(--ss-ink-2)";
  if (p <= 20) return "var(--ss-amber-ink)";
  return "var(--ss-ink-4)";
}

function PosBadge({ pos }: { pos: number }) {
  const bg = pos <= 3 ? "var(--ss-sage-soft)" : pos <= 10 ? "var(--ss-bg-elev)" : pos <= 20 ? "var(--ss-amber-soft)" : "var(--ss-bg-elev)";
  return (
    <span className="ss-num" style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: bg, color: positionColor(pos),
      fontSize: 11, fontWeight: 600,
    }}>
      #{pos.toFixed(1)}
    </span>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ss-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ss-ink-3)", fontWeight: 500 }}>
        {label}
      </div>
      <div className="ss-num" style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--ss-font-display)", letterSpacing: "-0.02em", color: "var(--ss-ink)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>{sub}</div>}
    </div>
  );
}

function BrandedToggle({ value }: { value: BrandedFilter }) {
  const options: Array<{ value: BrandedFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "true", label: "Branded" },
    { value: "false", label: "Non-Branded" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Link
            key={option.value}
            href={`/search-console?branded=${option.value}`}
            className="ss-btn ss-btn-sm"
            style={{
              textDecoration: "none",
              ...(active ? { borderColor: "var(--ss-orange-soft)", background: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" } : {}),
            }}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function QueryTable({ rows, keyLabel, keyField }: {
  rows: GscRow[]; keyLabel: string; keyField: "query" | "url";
}) {
  if (rows.length === 0) {
    return <div style={{ padding: "24px 16px", fontSize: 13, color: "var(--ss-ink-3)" }}>No data yet.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ss-tbl" style={{ minWidth: 540 }}>
        <thead><tr>
          <th style={{ width: "45%" }}>{keyLabel}</th>
          <th style={{ textAlign: "right" }}>Clicks</th>
          <th style={{ textAlign: "right" }}>Impressions</th>
          <th style={{ textAlign: "right" }}>CTR</th>
          <th style={{ textAlign: "right" }}>Position</th>
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320, display: "block" }}>
                  {row[keyField] ?? "—"}
                </span>
              </td>
              <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmtNum(row.clicks)}</td>
              <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmtK(row.impressions)}</td>
              <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{row.ctr.toFixed(1)}%</td>
              <td style={{ textAlign: "right" }}><PosBadge pos={row.position} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SearchConsolePage({
  searchParams,
}: {
  searchParams?: { branded?: string | string[] };
}) {
  const branded = normalizeBranded(searchParams?.branded);
  const [summary, queries, pages, almostPage1, byProductPage] = await Promise.all([
    getSummary(), getQueries(branded), getPages(), getAlmostPage1(branded), getByProductPage(),
  ]);

  const quickWins = pages.filter((p) => p.position >= 5 && p.position <= 20 && p.impressions >= 50);
  const lowCtr = queries.filter((q) => q.position <= 5 && q.ctr < 0.02 && q.impressions >= 100);
  const topQueryStrings = queries.slice(0, 10).map((q) => q.query ?? "").filter(Boolean);
  const isEmpty = !summary || summary.row_count === 0;
  const totalPotential = almostPage1.reduce((s, r) => s + r.potentialExtraClicks, 0);
  const totalOpportunities = almostPage1.length + quickWins.length + lowCtr.length;

  return (
    <>
      {/* Topbar */}
      <div className="ss-page-topbar ss-topbar-blur sticky z-10 flex items-center gap-3 border-b"
        style={{ borderColor: "var(--ss-line)" }}>
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)" }}>
          SEO Opportunities
        </div>
        <div style={{ fontSize: 13, color: "var(--ss-ink-3)" }}>
          <span style={{ margin: "0 6px", color: "var(--ss-ink-4)" }}>/</span>
          90-day window
        </div>
        <div style={{ flex: 1 }} />
        <TopbarSearch />
        <span className="ss-pill ss-pill-orange">{quickWins.length} quick wins</span>
        <span className="ss-pill ss-pill-amber">{almostPage1.length} almost page 1</span>
      </div>

      <div className="ss-content-stack">
        {isEmpty ? (
          <div className="ss-card" style={{ padding: 24 }}>
            <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, color: "var(--ss-ink)", marginBottom: 8 }}>
              No data synced yet
            </div>
            <div style={{ fontSize: 13, color: "var(--ss-ink-3)", marginBottom: 16 }}>
              Run the seed script to pull 90 days of data from Google Search Console:
            </div>
            <pre style={{ background: "var(--ss-bg-elev)", border: "1px solid var(--ss-line)", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "var(--ss-ink-2)", fontFamily: "var(--ss-font-mono)" }}>
              cd apps/api && npx tsx src/scripts/seed-gsc.ts
            </pre>
          </div>
        ) : (
          <>
            {/* Opportunity hero banner */}
            {totalOpportunities > 0 && (
              <div className="ss-card ss-hero-grid" style={{
                padding: 20,
                alignItems: "center",
                background: "linear-gradient(135deg, var(--ss-bg-card) 0%, color-mix(in oklab, var(--ss-orange-soft) 40%, var(--ss-bg-card)) 100%)",
                borderColor: "var(--ss-orange-soft)",
              }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)", fontWeight: 500, marginBottom: 6 }}>
                    Clicks within reach
                  </div>
                  <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 8, color: "var(--ss-ink)" }}>
                    <span className="ss-num" style={{ color: "var(--ss-orange)" }}>+{fmtNum(totalPotential)}</span>{" "}
                    <span style={{ fontSize: 18 }}>est. clicks/mo</span>
                  </div>
                  <div style={{ color: "var(--ss-ink-3)", fontSize: 13 }}>
                    Across {totalOpportunities} ranked opportunities. Apply the top 3 to capture the majority of available lift.
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)", marginBottom: 6 }}>Quick wins</div>
                  <div className="ss-num" style={{ fontFamily: "var(--ss-font-display)", fontSize: 22, fontWeight: 600, color: "var(--ss-ink)" }}>{quickWins.length}</div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>Pos 5–20, high impressions</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)", marginBottom: 6 }}>Almost page 1</div>
                  <div className="ss-num" style={{ fontFamily: "var(--ss-font-display)", fontSize: 22, fontWeight: 600, color: "var(--ss-ink)" }}>{almostPage1.length}</div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>Pos 11–20, one push away</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)", marginBottom: 6 }}>Low CTR</div>
                  <div className="ss-num" style={{ fontFamily: "var(--ss-font-display)", fontSize: 22, fontWeight: 600, color: "var(--ss-ink)" }}>{lowCtr.length}</div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>Top 5, under 2% CTR</div>
                </div>
              </div>
            )}

            {/* KPI strip */}
            <div className="ss-kpi-grid">
              <KpiCard label="Total Clicks · 90d" value={fmtNum(summary!.clicks)} />
              <KpiCard label="Total Impressions · 90d" value={fmtK(summary!.impressions)} />
              <KpiCard label="Avg CTR" value={`${summary!.ctr.toFixed(1)}%`} />
              <KpiCard label="Avg Position" value={`#${summary!.position.toFixed(1)}`} />
            </div>

            {/* Quick Wins — pos 5–20, improve title/meta for CTR */}
            {quickWins.length > 0 && (
              <div className="ss-card" style={{ overflow: "hidden", borderColor: "var(--ss-orange-soft)" }}>
                <div style={{
                  padding: "14px 16px", borderBottom: "1px solid var(--ss-orange-soft)",
                  background: "linear-gradient(135deg, var(--ss-bg-card) 0%, var(--ss-orange-soft) 500%)",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 14, fontWeight: 600, color: "var(--ss-ink)", display: "flex", alignItems: "center", gap: 8 }}>
                        Quick Wins
                        <span className="ss-pill ss-pill-orange">{quickWins.length} pages · pos 5–20</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 4, maxWidth: 560 }}>
                        These pages already rank — a stronger title or meta description lifts CTR without needing more backlinks.
                      </div>
                    </div>
                  </div>
                </div>
                <QuickWinsTable quickWins={quickWins} topQueries={topQueryStrings} embedded />
              </div>
            )}

            {/* Almost Page 1 */}
            <AlmostPage1Table rows={almostPage1} />

            {/* Queries by Product Page */}
            {byProductPage.length > 0 && (
              <div className="ss-card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
                        Queries by Product Page
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
                        Exact query → landing page mapping · {byProductPage.length} product pages
                      </div>
                    </div>
                    <span className="ss-pill ss-pill-sage">{byProductPage.length} pages</span>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="ss-tbl" style={{ minWidth: 600 }}>
                    <thead><tr>
                      <th style={{ width: "30%" }}>Product Page</th>
                      <th>Top Queries</th>
                      <th style={{ textAlign: "right" }}>Clicks</th>
                      <th style={{ textAlign: "right" }}>Impressions</th>
                    </tr></thead>
                    <tbody>
                      {byProductPage.map((group, i) => (
                        <tr key={i}>
                          <td>
                            <span className="ss-num" style={{ fontSize: 12, color: "var(--ss-ink-3)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                              {group.url}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                              {group.queries.slice(0, 5).map((q, j) => (
                                <span key={j} style={{ fontSize: 11, color: "var(--ss-ink-2)", background: "var(--ss-bg-elev)", border: "1px solid var(--ss-line)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>
                                  {q.query}
                                  <span className="ss-num" style={{ color: "var(--ss-ink-4)", marginLeft: 4 }}>#{q.position.toFixed(0)}</span>
                                </span>
                              ))}
                              {group.queries.length > 5 && (
                                <span style={{ fontSize: 11, color: "var(--ss-ink-4)" }}>+{group.queries.length - 5} more</span>
                              )}
                            </div>
                          </td>
                          <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmtNum(group.clicks)}</td>
                          <td className="ss-num" style={{ textAlign: "right", color: "var(--ss-ink-2)" }}>{fmtK(group.impressions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Query explorer */}
            <div className="ss-card" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
                <div>
                  <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
                    Query Explorer
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
                    {queries.length} ranked queries · 90-day window
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <BrandedToggle value={branded} />
                  <span className="ss-pill">{fmtNum(queries.length)}</span>
                </div>
              </div>
              <QueryTable rows={queries} keyLabel="Query" keyField="query" />
            </div>

            {/* Pages */}
            <div className="ss-card" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
                <div>
                  <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
                    All Pages
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)", marginTop: 2 }}>
                    {pages.length} indexed pages · 90-day window
                  </div>
                </div>
                <span className="ss-pill">{fmtNum(pages.length)}</span>
              </div>
              <QueryTable rows={pages} keyLabel="Page" keyField="url" />
            </div>
          </>
        )}
      </div>
    </>
  );
}

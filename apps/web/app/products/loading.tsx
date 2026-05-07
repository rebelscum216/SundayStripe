import { PageHeader } from "../components/page-header";
import { Skeleton } from "../components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Catalog" title="Products" />

      <div className="flex gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="ss-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
          <Skeleton className="h-4 w-24" />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--ss-line)" }}>
                <td style={{ padding: "10px 12px" }}><Skeleton className="h-4 w-48" /></td>
                <td style={{ padding: "10px 12px" }}><Skeleton className="h-4 w-24" /></td>
                <td style={{ padding: "10px 12px" }}><Skeleton className="h-5 w-16" /></td>
                <td style={{ padding: "10px 12px" }}><Skeleton className="h-4 w-12" /></td>
                <td style={{ padding: "10px 12px" }}><Skeleton className="h-4 w-20" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded ${className}`} style={{ background: "var(--ss-line)" }} />;
}

export function CardSkeleton() {
  return (
    <div className="ss-card" style={{ padding: 16 }}>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-2 h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <Skeleton className="h-4 w-36" />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--ss-line)" }}>
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} style={{ padding: "10px 12px" }}>
                  <Skeleton className="h-4 w-3/4" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ss-line)" }}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ padding: "10px 12px", borderBottom: "1px solid var(--ss-line)" }}>
            <Skeleton className="h-4 w-20" />
            <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

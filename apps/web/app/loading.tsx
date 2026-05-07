import { PageHeader } from "./components/page-header";
import { CardSkeleton, Skeleton, SectionSkeleton } from "./components/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Command Center" meta="Live operating cockpit" />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </section>
        <SectionSkeleton rows={5} />
        <SectionSkeleton rows={4} />
      </div>
    </>
  );
}

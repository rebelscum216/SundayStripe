import { PageHeader } from "./components/page-header";
import { CardSkeleton, Skeleton, SectionSkeleton } from "./components/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Command Center" meta="Live operating cockpit" />
      <div className="ss-content-stack">
        <section className="ss-kpi-grid">
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

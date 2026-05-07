import { PageHeader } from "../components/page-header";
import { CardSkeleton, TableSkeleton } from "../components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Marketing" title="Search Console" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={8} cols={4} />
        <TableSkeleton rows={8} cols={4} />
      </div>

      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}

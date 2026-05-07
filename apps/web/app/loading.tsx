import { PageHeader } from "./components/page-header";
import { CardSkeleton, Skeleton, SectionSkeleton } from "./components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Commerce Hub" title="Command Center" meta="Live operating cockpit" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <SectionSkeleton rows={5} />
          <SectionSkeleton rows={4} />
          <SectionSkeleton rows={3} />
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="mb-2 h-5 w-48" />
            <Skeleton className="mb-1 h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-4 h-7 w-28" />
          </div>
          <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3">
              <Skeleton className="h-4 w-28" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

import { Skeleton } from "../../components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-zinc-800 pb-5">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="h-9 w-72" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-28 rounded border border-zinc-800" />
        <Skeleton className="h-28 rounded border border-zinc-800" />
        <Skeleton className="h-28 rounded border border-zinc-800" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 rounded border border-zinc-800" />
          <Skeleton className="h-48 rounded border border-zinc-800" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 rounded border border-zinc-800" />
          <Skeleton className="h-48 rounded border border-zinc-800" />
        </div>
      </div>
    </div>
  );
}

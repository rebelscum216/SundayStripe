import { PageHeader } from "../components/page-header";
import { TableSkeleton } from "../components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Hub" title="Loading..." />
      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}

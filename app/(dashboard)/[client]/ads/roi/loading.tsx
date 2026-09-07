import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SkeletonStatCards count={4} />
      </section>
      <SkeletonTable rows={12} cols={6} />
    </div>
  );
}

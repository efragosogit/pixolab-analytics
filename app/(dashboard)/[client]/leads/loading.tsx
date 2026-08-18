import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SkeletonStatCards count={3} />
      </section>
      <div className="skeleton h-9 w-72 rounded-lg" />
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}

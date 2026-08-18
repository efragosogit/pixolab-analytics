import {
  SkeletonBars,
  SkeletonChartCard,
  SkeletonPageHeader,
  SkeletonStatCards,
  SkeletonTable,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <div className="rounded-xl border border-dashed border-border py-10">
        <div className="skeleton mx-auto h-4 w-72 rounded-md" />
      </div>
      <div className="flex flex-col gap-6 opacity-60">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonStatCards count={4} />
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SkeletonChartCard height={220} />
          </div>
          <SkeletonBars rows={3} />
        </section>
        <SkeletonTable rows={5} cols={5} />
      </div>
    </div>
  );
}

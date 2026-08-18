import {
  SkeletonBars,
  SkeletonChartCard,
  SkeletonPageHeader,
  SkeletonStatCards,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SkeletonStatCards count={5} />
      </section>
      <SkeletonChartCard height={200} />
      <section className="grid gap-4 lg:grid-cols-3">
        <SkeletonBars rows={8} />
        <SkeletonBars rows={8} />
        <SkeletonBars rows={4} />
      </section>
    </div>
  );
}

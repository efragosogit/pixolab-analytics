import {
  SkeletonBars,
  SkeletonCard,
  SkeletonChartCard,
  SkeletonFunnelCard,
  SkeletonJourney,
  SkeletonPageHeader,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <SkeletonJourney />
      <SkeletonChartCard height={220} />
      <section className="grid gap-6 lg:grid-cols-3">
        <SkeletonFunnelCard />
        <SkeletonFunnelCard />
        <SkeletonFunnelCard />
      </section>

      <div className="mt-2 flex items-baseline justify-between">
        <div className="skeleton h-9 w-72 rounded-md" />
      </div>
      <section className="grid gap-6 lg:grid-cols-2">
        <SkeletonBars rows={10} />
        <SkeletonBars rows={10} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
        <SkeletonCard title={false}>
          <div className="skeleton h-3 w-24 rounded-md" />
          <div className="skeleton mt-2 h-8 w-32 rounded-md" />
        </SkeletonCard>
        <SkeletonChartCard height={180} />
      </div>
    </div>
  );
}

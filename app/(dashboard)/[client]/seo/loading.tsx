import {
  SkeletonChartCard,
  SkeletonPageHeader,
  SkeletonStatCards,
  SkeletonTable,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonPageHeader />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SkeletonStatCards count={4} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <SkeletonChartCard height={200} />
        <SkeletonChartCard height={200} />
      </section>
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}

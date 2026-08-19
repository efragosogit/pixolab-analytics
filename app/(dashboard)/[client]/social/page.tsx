import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  HeartIcon,
  MessageCircleIcon,
  Share2Icon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { getSocialOverview, getSocialPlatforms, getSocialPosts } from "@/lib/mock-data";
import { resolveRange } from "@/lib/date-range";
import { ComingSoon, PageHeader, Section, SourceStatusBadge, StatCard } from "@/components/ui-kit";
import { TrendArea } from "@/components/charts";
import { TableScroll } from "@/components/table-scroll";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function fmtCompact(v: number) {
  return Intl.NumberFormat("es-MX", { notation: "compact" }).format(v);
}

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: "var(--chart-5)",
  Facebook: "var(--chart-1)",
  TikTok: "var(--chart-7)",
};

export default async function SocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await params;
  const range = resolveRange(await searchParams);
  const overview = getSocialOverview(client, range);
  const platforms = getSocialPlatforms(client, range);
  const posts = getSocialPosts(client, range);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Instagram · Facebook · TikTok"
        title="Social media"
        description={`${format(parseISO(range.startDate), "d MMM", { locale: es })} — ${format(parseISO(range.endDate), "d MMM yyyy", { locale: es })}.`}
        action={<SourceStatusBadge connected={false} />}
      />

      <ComingSoon
        title="Módulo desactivado"
        note="requiere conectar las APIs de Meta (Instagram/Facebook) e integrar TikTok for Business. Lo de abajo es solo un ejemplo de cómo se verá una vez conectado, no datos reales."
      />

      {/*
        Everything below is mock data (see lib/mock-data.ts) shown only as
        a shape preview, deliberately inert (no hover/click affordances
        should read as "this works") and visually muted so it doesn't get
        mistaken for live numbers now that ComingSoon above already says
        this module is off.
      */}
      <div className="pointer-events-none flex select-none flex-col gap-6 opacity-45 grayscale">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Seguidores totales"
            value={overview.followers.toLocaleString("es-MX")}
            delta={overview.followersDelta}
            icon={<UsersIcon className="size-4" />}
            accent
          />
          <StatCard
            label="Alcance"
            value={fmtCompact(overview.reach)}
            icon={<ZapIcon className="size-4" />}
          />
          <StatCard
            label="Tasa de engagement"
            value={`${overview.engagementRate.toFixed(1)}%`}
            icon={<HeartIcon className="size-4" />}
          />
          <StatCard
            label="Posts en el período"
            value={String(posts.length)}
            icon={<Share2Icon className="size-4" />}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Section title="Alcance por día">
              <TrendArea
                data={overview.series}
                dataKey="reach"
                color="var(--chart-1)"
                format="compact"
                height={220}
              />
            </Section>
          </div>

          <Section title="Por plataforma">
            <div className="flex flex-col gap-4">
              {platforms.map((p) => {
                const delta = p.followersDelta;
                return (
                  <div key={p.platform} className="flex items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PLATFORM_COLOR[p.platform] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{p.platform}</div>
                      <div className="tabular text-xs text-muted-foreground">
                        {p.followers.toLocaleString("es-MX")} seguidores ·{" "}
                        {p.engagementRate.toFixed(1)}% eng.
                      </div>
                    </div>
                    <span
                      className={
                        (delta ?? 0) >= 0
                          ? "tabular text-xs font-medium text-status-good"
                          : "tabular text-xs font-medium text-status-critical"
                      }
                    >
                      {(delta ?? 0) >= 0 ? "+" : ""}
                      {(delta ?? 0).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </section>

        <Section title="Publicaciones con mejor alcance">
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pl-1 font-medium">Publicación</th>
                  <th className="py-3 text-right font-medium">Alcance</th>
                  <th className="py-3 text-right font-medium">
                    <HeartIcon className="ml-auto size-3.5" />
                  </th>
                  <th className="py-3 text-right font-medium">
                    <MessageCircleIcon className="ml-auto size-3.5" />
                  </th>
                  <th className="py-3 pr-1 text-right font-medium">
                    <Share2Icon className="ml-auto size-3.5" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/40 last:border-0 hover:bg-accent/40"
                  >
                    <td className="max-w-md py-3 pl-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: `${PLATFORM_COLOR[post.platform]}66`,
                            color: PLATFORM_COLOR[post.platform],
                            backgroundColor: `${PLATFORM_COLOR[post.platform]}1a`,
                          }}
                        >
                          {post.platform}
                        </Badge>
                        <span className="truncate text-foreground">{post.caption}</span>
                      </div>
                    </td>
                    <td className="tabular py-3 text-right font-medium text-foreground">
                      {post.reach.toLocaleString("es-MX")}
                    </td>
                    <td className="tabular py-3 text-right text-foreground/80">
                      {post.likes.toLocaleString("es-MX")}
                    </td>
                    <td className="tabular py-3 text-right text-foreground/80">
                      {post.comments.toLocaleString("es-MX")}
                    </td>
                    <td className="tabular py-3 pr-1 text-right text-foreground/80">
                      {post.shares.toLocaleString("es-MX")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Section>
      </div>
    </div>
  );
}

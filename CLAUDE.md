@AGENTS.md

> **⚠️ See `TRANSITION-2026-08-12.md` in this same folder for the full
> migration story** — this folder **was** `pixolab-dashboards/lumiservicios`
> and is now the top-level `pixolab-analytics` repo (the name was
> reassigned from the OpenPanel source folder, which is now
> `pixolab-openpanel`). That move, the first Coolify deploy, and the
> `analytics.pixolab.com.mx` domain cutover are all **done** as of
> 2026-08-13 — see "Deployed 2026-08-13" below for current status. That
> file still has Coolify access details worth keeping around.

# Lumiservicios — custom analytics dashboard

## What this is

A Next.js dashboard meant to replace Looker Studio, built originally for
Pixolab's client **lumiservicios.com**. **As of 2026-08-12 this is no
longer a one-repo-per-client design** — earlier notes in this file (and
in `pixolab-dashboards/_infra/README.md`) describing "sibling folders
under `pixolab-dashboards/`, each its own Next.js app" are **superseded**.
This is now **one shared multi-tenant app** serving every client dashboard
from a single deployment, at `analytics.pixolab.com.mx/{client}/...` —
see "Multi-tenant architecture" below. Lumiservicios (`lumiservicios`
slug) is still the only real client, but the whole shape — schema,
routing, auth, data layer — is generic, proven with a real second
throwaway test client during the rewrite (see git history / the session
that did this if you need the exact verification steps).

## Multi-tenant architecture (2026-08-12)

- **Routing**: `app/(dashboard)/[client]/...` — every existing page lives
  under a `client` dynamic segment. `app/(dashboard)/page.tsx` (no
  `[client]`) is the post-login router: exactly one accessible client →
  redirect straight there; multiple → a picker; zero → a clear no-access
  state.
- **Tenant registry**: a `clients` table (`db/migrations/004_multi_tenant.sql`)
  — slug (also the URL segment and the value stored in `leads.client`/
  `client_memberships.client`), display name, favicon path, an
  `allowed_origin` for the per-client ingest webhook
  (`005_client_allowed_origin.sql`), `active` flag. Onboarding a new
  client needs a row here.
- **Per-client credentials**: env vars prefixed `CLIENT_<SLUG>_*`
  (`CLIENT_LUMISERVICIOS_OPENPANEL_CLIENT_ID`, etc. — see
  `.env.local.example` for the full list) resolved per-request by
  `lib/client-config.ts`'s `getClientConfig(slug)`. Genuinely
  shared-across-clients credentials (Google Ads OAuth app, the GSC
  service account, the OpenPanel instance URL) stay as plain global env
  vars — only what actually varies per client is prefixed. `lib/openpanel.ts`,
  `lib/gsc.ts`, `lib/google-ads.ts`, `lib/leads-db.ts` all take their
  per-client identifier as an explicit function argument now — nothing in
  those files reads a per-client env var at module scope anymore.
- **Auth**: `users` is a global identity (one email, one password);
  `client_memberships` is the join table recording which client(s) a
  person has access to and whether they've accepted. `@pixolab.com.mx`
  staff get every active client automatically, computed live, no
  membership row needed. Accepting a second client's invite (for someone
  who already has a password from a first invite) skips the password
  form entirely — see `lib/auth/users.ts`'s `acceptInvite`. Full schema
  reasoning is in `004_multi_tenant.sql`'s comments.
- **Leads ingest webhook** is per-client:
  `app/ingest/leads/[client]/route.ts` (CORS origin looked up from
  `clients.allowed_origin`). **Lives at `/ingest/leads/[client]`, not under
  `/api`** — see "Fixed 2026-08-13: `/api/*` routes unreachable" below for
  why. The earlier flat `app/api/leads/ingest/route.ts` (hardcoded to
  `client = "lumiservicios"`) was removed at the same time as that move —
  turned out no live GTM tag had ever actually been repointed at either
  path, so there was nothing to preserve compatibility with. Every client,
  including Lumiservicios, uses the per-client route now.
- **Deployed 2026-08-13**: live at `https://analytics.pixolab.com.mx`,
  Coolify project "Pixolab Analytics" (uuid `h6yhv2d5p7exnlpfi87efzq6`),
  application uuid `j14m3wzqdi1bkgewxlv723me`, deployed from
  `efragosogit/pixolab-analytics` (public repo — see
  `TRANSITION-2026-08-12.md` for why: private repos on this Coolify need a
  dedicated GitHub App installed per repo, no code in this codebase is
  secret so public was the pragmatic choice). `Dockerfile` at repo root,
  `build_pack: dockerfile`. OpenPanel's dashboard UI moved to
  `openpanel.pixolab.com.mx` the same day; **its API deliberately stayed
  at `analytics.pixolab.com.mx/api`** — every live client site's GTM
  container has that URL hardcoded in its tracking snippet, so that
  mapping stays until each site's GTM container is confirmed updated (not
  done yet — Lumiservicios + NUMA are the two live sites as of this
  writing; a third, Concepta, exists but has no events yet so nothing to
  break there).
  - **Coolify gotchas hit during this deploy, worth knowing for the next
    one**: (1) Coolify injects every application env var as a Docker
    build `ARG` by default — a multiline secret (the GSC service account
    private key) broke the Dockerfile parser until every env var was
    created with `is_buildtime: false` (none of them are actually needed
    at `next build` time in this app). (2) A value containing literal
    `\n` two-char sequences (not real newlines — see `lib/gsc.ts`'s own
    comment on this) needs `is_literal: true` on creation or Coolify
    re-wraps/mangles it. (3) The `POST /applications/{uuid}/envs/bulk`
    endpoint does NOT upsert by key — it always creates new rows,
    silently duplicating everything already present; use individual
    `POST .../envs` calls (or delete everything and recreate) instead.
    (4) Every env var Coolify shows in its API is actually a *pair* (prod
    + preview) — that's normal, not a duplication bug.
- **Fixed 2026-08-13: deployed container ran in UTC, not Mexico City time,
  silently shifting every date preset by a day.** `next.config.ts` pins
  `process.env.TZ = "America/Mexico_City"` as a module-level side effect —
  that only takes effect when `next.config.ts` itself is executed (`next
  dev`, `next start`), but this `Dockerfile`'s `CMD` runs the **standalone**
  build's `server.js` directly, which never re-imports `next.config.ts`, so
  the assignment never ran in production. Confirmed live via `docker exec
  ... node -e '...timeZone'` → `"UTC"`. Practical effect: any time after
  ~6pm CDMX (once UTC has already rolled to the next calendar day),
  `lib/date-range.ts`'s `startOfToday()`-based presets silently queried the
  wrong day — "Hoy" resolved to tomorrow (0 visitors, nothing happened yet)
  and "Ayer" resolved to today's partial day. Fixed by setting `ENV
  TZ=America/Mexico_City` directly in the `Dockerfile`'s runner stage — a
  real container env var Node/V8 reads at process start, independent of
  whether `next.config.ts`'s side effect survives in this build output.
  Verified fixed post-redeploy: same `docker exec` check → `"America/Mexico_City"`.
- **Fixed 2026-08-13: this app's own `/api/*` routes are unreachable on
  `analytics.pixolab.com.mx`, silently swallowed by OpenPanel's API
  reservation on that same domain+prefix.** Discovered while investigating
  a "new leads aren't showing up" report. Root cause: Traefik's routing
  rule for OpenPanel's API service is `Host(analytics.pixolab.com.mx) &&
  PathPrefix(/api)` (see "Deployed 2026-08-13" above — deliberately kept
  so client GTM containers wouldn't break), which is *more specific* than
  this app's own `Host(analytics.pixolab.com.mx) && PathPrefix(/)` rule —
  Traefik's default longest-match-wins behavior sends every
  `analytics.pixolab.com.mx/api/*` request to OpenPanel's API container
  unconditionally, never to this Next.js app, regardless of whether this
  app defines a route there. Confirmed live: a request to the (now-former)
  `app/api/leads/ingest/[client]/route.ts` at
  `analytics.pixolab.com.mx/api/leads/ingest/lumiservicios` returned
  OpenPanel's own 404 JSON (`{"message":"Route POST:/leads/ingest/... not
  found"}`), never reached this app's code at all. Fixed by moving the
  leads webhook to `app/ingest/leads/[client]/route.ts` (`/ingest/leads/…`,
  outside `/api` entirely) — see that file's doc comment. **Any future
  route added under `app/api/*` in this app will hit the exact same wall
  as long as OpenPanel's API keeps its `/api` reservation on this domain**
  (see the not-yet-done GTM migration in "Not yet done" below) — don't put
  new API routes there; use a different top-level segment.
  - Turned out this specific bug hadn't actually broken anything yet: the
    live GTM container on lumiservicios.com was checked directly (fetched
    its published `gtm.js`) and confirmed it **never got updated** to call
    either ingest path in the first place — still only the original
    `window.op('track', ...)` → OpenPanel calls from 2026-08-06. So the
    reported "new leads aren't showing up" was actually caused by the GTM
    tag update always having been a manual step still pending on the
    client's side (see "Not yet done" below), not by this routing bug —
    but the routing bug was real, latent, and would have silently 404'd
    the moment that GTM step *was* done, so worth having fixed regardless.
  - **Update same day, after the fact**: the client's live GTM container
    was updated (their side, not this session's access) to actually call
    `/ingest/leads/lumiservicios`, and the historical gap (2026-08-06 →
    2026-08-17) was backfilled from a fresh CFDB7 export using
    `scripts/import-historical-leads.mjs` (made idempotent the same day —
    dedupes by `raw->>'cf7db_id'`, safe to re-run against a full export).
    Verified end-to-end with two real live submissions on the site
    afterward — both landed in Postgres with real field data (`raw` has no
    `imported_from` marker, unlike backfilled rows). This is genuinely
    live now, not still-pending — see the Leads row below.
- **Fixed 2026-08-17: OpenPanel's `/events` endpoint has an undocumented,
  silent 100-row-per-call cap with no total count and no ordering
  guarantee — `getDailyEventCounts` (leads journey stage, "Leads por día"
  chart, per-source funnels) was undercounting real conversions.** Caught
  because a client-reported "100 leads" figure on `/conversiones`
  (30-day range) turned out to be exactly `whatsapp_click`'s count alone —
  suspicious given the stage is supposed to be `whatsapp_click +
  form_submitted` combined. Root cause, in two layers: (1) the original
  code queried both event names in one `/events` call, so they shared one
  100-row budget — WhatsApp's much higher volume crowded out
  `form_submitted` almost entirely (3 of ~7 rows came back). (2) Splitting
  into one call per event name wasn't enough either: manually bisecting
  the 30-day range into two 15-day `/events` calls for `whatsapp_click`
  alone returned 34 + 86 = **120** — the "single" 100-row response had
  itself been silently capped, not the true total. Fixed in
  `lib/openpanel.ts`'s new `getAllEvents` — recursively bisects the date
  range on any event name whenever a call comes back at exactly the
  100-row cap (the only observable sign of truncation), until every
  sub-range is safely under it. Verified against the live app: the
  "Leads" journey stage went from a wrong 100 to a correct 127
  (120 WhatsApp + 7 form, cross-checked by manually summing the daily
  chart data) — real conversions had been getting lost from the dashboard,
  not just a display quirk.

It pulls from Pixolab's self-hosted **OpenPanel** instance
(`https://analytics.pixolab.com.mx/api` — API only, see the domain note
above) as the source of truth for on-site behavior — traffic, conversions,
funnels. Two other pieces of context that matter but live elsewhere:

- **OpenPanel itself**: see `pixolab-openpanel/CLAUDE.md` (usage/playbooks)
  and `pixolab-server/docs/` (infra — the instance runs a **custom-built**
  API image, not the official one, specifically so `/overview`, `/funnel`,
  `/pages/performance` etc. exist — see `pixolab-server/docs/inventory.md`
  "Custom image upgrade"). If those endpoints ever start 404ing again,
  that's why — check there first.
- **The bigger plan**: this dashboard's long-term job is to blend OpenPanel
  data with sources OpenPanel can't hold — Search Console (SEO, **done**),
  ad spend (Google Ads, **done**, see below), CRM leads/closed-deals
  (Twenty CRM, already running in Coolify), social media (Meta/TikTok
  APIs). Until a source is wired up, its page renders clearly-labeled
  **simulated** data shaped like the real thing will be — see "Mock data"
  below. Not every source needs to go through OpenPanel's own integrations
  (it has one for GSC too, but that needs `GOOGLE_CLIENT_ID`/`SECRET` + a
  redirect URI wired up in Coolify, infra this dashboard doesn't have
  access to) — connecting a source straight to this dashboard, like SEO
  and Ads now do, is equally valid and sometimes simpler.

## Current state (2026-08-08 — re-verify, don't trust blindly)

**Nav was restructured this same day**: the old single `/leads` page (funnels +
journey indicator) is now **`/conversiones`**. A new, separate **`/leads`**
exists — a simulated prospects table. Don't confuse the two when reading
old context/history — anything from before 2026-08-08 that says "the
Leads page" almost certainly means what's now `/conversiones`.

| Page | Route | Status |
|---|---|---|
| Tráfico general | `/` | **Real data.** `/overview`, `/pages/top`, `/traffic/referrers`, `/traffic/devices`. Period-over-period deltas on every stat card. |
| Performance | `/performance` | **Real data.** `/pages/performance` — title + SEO signal badges (high bounce / low engagement / good landing page) |
| Leads | `/leads` | **Real data.** A prospects table (`components/leads-table.tsx`) reading Postgres via `lib/leads-db.ts` — name/email/phone/source/detail/date+time (Mexico City tz), filterable by source via tabs, click a row to open a qualification modal (1-5 rating + observations, see "Done since the redesign, continued (2026-08-11)" below). Two sources only: Formulario de contacto, Descarga de catálogo. WhatsApp is deliberately excluded (no CRM access to those conversations). 57 historical leads backfilled from CF7DB 2026-08-11, a further gap (2026-08-06 → 2026-08-17, caused by the GTM tag update having been pending, see "Fixed 2026-08-13: this app's own `/api/*` routes are unreachable" above) backfilled 2026-08-17 the same way; Lumiservicios' live GTM container now actually calls `/ingest/leads/lumiservicios` and new leads arrive automatically — verified live with two real submissions the same day. `lib/mock-data.ts`'s `getLeads` is now dead code for this page, kept for reference. |
| Conversiones | `/conversiones` | **Real data**, 3 embudos: `screen_view → whatsapp_click` (real OpenPanel `/funnel`); `Formulario de contacto` and `Descarga de catálogo` (3-stage, hand-assembled from `/overview` + `/pages/performance` + `/events` — `/funnel` can't filter a step by path, see `StageFunnel`'s doc comment in `app/(dashboard)/conversiones/page.tsx`). Plus a top journey indicator (Impresiones → Tráfico → Leads, Impresiones still simulated) and a daily leads chart. |
| SEO | `/seo` | **Real data.** Connected directly to Google Search Console via a service account (`lib/gsc.ts`) — deliberately *not* through OpenPanel's GSC integration, see "Bigger plan" above. |
| Publicidad | `/ads` | **Real data.** Connected directly to Google Ads via OAuth (`lib/google-ads.ts`) — Google Ads has no service-account option, unlike GSC. Only Google Ads; Meta Ads still not connected. |
| Social media | `/social` | **Simulated**, no real source planned yet (needs Meta Graph API + TikTok for Business) |

Every page respects the global date-range picker (top bar) and is
`tsc`/`lint`/`pnpm build` clean as of the last real update.

## Design system (2026-08-06 redesign, revised same day)

The original redesign shipped a dark-only, amber-branded, serif-display
"precision instrument" aesthetic. The user explicitly rejected that
direction the same day ("No me gusta el look editorial dark con types
serifs... el estilo de colores lo requiero neutral... El switch de light a
dark mode que funcione") — so the system below is neutral/unbranded with a
**real** working light/dark toggle, not the brand-accent version. If you
find `--lumen`, `font-display`, or `Fraunces` referenced anywhere, that's
leftover from the rejected version and should be removed, not restored.

- **Component library**: **shadcn/ui**, initialized on **Base UI**
  (`@base-ui/react`), not Radix — this project's shadcn generation defaults
  to Base UI. API differences that matter: `TooltipProvider` takes `delay`
  not `delayDuration`; triggers (`PopoverTrigger`, etc.) don't support
  Radix's `asChild` — style the trigger directly with `buttonVariants(...)`
  from `components/ui/button.tsx` instead of nesting a `<Button asChild>`
  inside it. Components live in `components/ui/` (shadcn-managed, safe to
  re-run `pnpm dlx shadcn@latest add <x>` for more) vs. `components/*.tsx`
  (hand-written, dashboard-specific).
- **Charts**: Recharts, wrapped in `components/charts.tsx`
  (`TrendArea`, `TrendLines`, `RankedBars`, `CategoryBars`). **Never pass a
  formatter function as a prop from a Server Component page into these** —
  they're Client Components, and Next throws "functions cannot be passed
  to Client Components" across that boundary. Formatting is a serializable
  `format: "number" | "compact" | "currency" | "percent"` string prop
  instead, resolved to an actual formatter *inside* `charts.tsx`. If you
  need a new format kind, add it to the `ValueFormat` union there, don't
  reach for a function prop again. Chart grid/axis colors reference the
  CSS variables `var(--border)` / `var(--muted-foreground)` directly
  (valid in SVG presentation attributes) so they follow the active theme
  automatically instead of being hardcoded per-mode.
- **Palette**: real light (`:root`) and dark (`.dark`) token pairs in
  `app/globals.css`, switched at runtime by `next-themes` (see below) — no
  brand accent color, no `--lumen`. Values are the **dataviz skill's own
  reference palette** (`references/palette.md`), used unmodified rather
  than customized to the client's brand, per the explicit "neutral, not
  personalized to the brand" instruction. The categorical chart palette
  (`--chart-1` through `--chart-8`) is that same reference palette's
  validated hue order, with distinct light- and dark-mode steps — don't
  reorder without re-running `node scripts/validate_palette.js` from the
  dataviz skill's directory for both `--mode light` and `--mode dark`.
  Status colors (`--status-good/warning/serious/critical`) are the skill's
  fixed set, reserved for state, never reused as a series color.
- **Light/dark toggle**: `next-themes`'s `ThemeProvider` wraps the app in
  `app/layout.tsx` (`attribute="class"`, `defaultTheme="system"`,
  `enableSystem`; `<html>` has `suppressHydrationWarning` since the
  provider patches the class after hydration). `<html>` no longer
  hardcodes `dark` — the provider toggles `.dark` on it at runtime.
  `components/theme-toggle.tsx` is the sun/moon button in the topbar; it
  reads mount state via `useSyncExternalStore` (not a `useEffect` +
  `setState`, which trips this repo's `react-hooks/set-state-in-effect`
  lint rule) to avoid a hydration mismatch on the icon before the client
  knows the resolved theme.
- **Fonts**: Manrope (body/UI, default `font-sans`) + IBM Plex Mono (all
  numeric data, `font-mono` / the `.tabular` utility) only — no serif
  display font. Headings use `font-semibold` at larger sizes instead of a
  second typeface.
- **One axis per chart, always.** Metrics with very different units/scale
  (spend $ vs. conversions count; clicks vs. impressions; reach vs.
  engagement) are rendered as **two separate `TrendArea` cards side by
  side**, never one dual-axis chart — that's a dataviz-skill non-negotiable,
  not a style preference. Only combine series in `TrendLines` when they
  share a real unit (e.g. two count-of-visits-like metrics).

## Date range picker & PDF export

- `lib/date-range.ts` — presets (Hoy, Ayer, 7d, 30d, Este mes, Mes pasado,
  3m, Personalizado) + `resolveRange()` reads `?period=<preset>` or
  `?from=&to=` from the page's `searchParams` + `previousRange()` /
  `percentDelta()` for the stat-card deltas. **Every page component takes
  `searchParams: Promise<...>` and calls `resolveRange(await
  searchParams)`** — this is how the picker (a Client Component that
  pushes to the URL) actually changes what a Server Component page fetches.
  Adding a new page? Copy this pattern, don't invent client-side state for
  the range.
- `components/date-range-picker.tsx` — the popover UI itself. Preset list
  + a 2-month range calendar for custom ranges, both write to the URL via
  `router.push`.
- `components/export-pdf-button.tsx` — client-side only, `html2canvas-pro`
  (not plain `html2canvas` — the plain one chokes on modern CSS color
  functions like `oklch()`/`color-mix()` that shadcn's theme uses
  extensively) screenshots `#dashboard-report` (the `<main>` id, set in
  `layout.tsx`) and `jspdf` turns it into a downloadable PDF with a title
  bar. If you add a new page, add its route → title mapping to
  `PAGE_TITLES` in that file so the exported filename/header is right.

## Mock data (`lib/mock-data.ts`)

SEO, Ads, and Social pages have no real data source connected yet. Their
numbers come from `lib/mock-data.ts` — **seeded**, not `Math.random()`
every render (a `mulberry32` PRNG keyed off the selected date range), so
the same period always shows the same numbers in a session instead of
jittering on every navigation. Every page rendering mock data carries a
visible `<SimulatedBadge />` (dashed border, "Datos simulados" label) next
to its title — **never remove that badge without actually connecting a
real source**, it's the whole point of the pattern. When a real source
lands (GSC connected, ads API wired up, etc.), replace the mock-data call
with a real fetch using the exact same page-level shape so the UI doesn't
need to change, and delete that page's generator functions from
`mock-data.ts`.

## Done since the redesign (2026-08-06, same day)

- **`form_submitted` and `catalog_download` events exist and are live.**
  Lumiservicios uses Contact Form 7 on WordPress, which submits via AJAX
  and cancels the native `submit` event — GTM's generic "Form Submission"
  trigger doesn't fire on it. A single Custom HTML tag (trigger: All Pages)
  listens for CF7's own `wpcf7mailsent` DOM event and branches on
  `event.detail.contactFormId` to send the right event name — CF7 form id
  `1319` (`/contactanos`) → `form_submitted`, id `1620` (`/catalogo-lumi`)
  → `catalog_download`. **Deliberately no personal fields in either
  event** (no name/email) — that data lives in the CF7DB WordPress plugin
  instead, cross-referenceable by timestamp; see the methodological note
  on the Leads page for why. Full snippet is in `pixolab-analytics/CLAUDE.md`
  under "track a specific click/button via GTM".
- **SEO is real** — connected directly to Google Search Console via a
  service account, not through OpenPanel. See `lib/gsc.ts` and the
  `.env.local.example` comments for setup. `lib/mock-data.ts`'s
  `getSeoOverview`/`getSeoQueries` are now dead code, kept only in case a
  future page wants simulated SEO data for some reason — safe to delete.
- **Ads is real** (2026-08-08) — connected directly to Google Ads via
  OAuth (no service-account option for a regular advertiser account, see
  `lib/google-ads.ts`'s doc comment). Refresh token generated with
  `scripts/get-google-ads-refresh-token.mjs` (one-time, interactive — safe
  to leave in the repo, needs live OAuth client credentials to do
  anything). Developer token is at "Test account access" but real-account
  queries already work fine, verified live — don't block on Basic access
  approval. Gotcha worth knowing: a GAQL query on `FROM campaign` returns
  one row **per (campaign, date)**, not one row per date, even when no
  campaign field is in `SELECT` — `getAdsOverview` aggregates client-side,
  don't assume the API grouped it for you if you add a new query. Also:
  `lib/mock-data.ts`'s `getAdsOverview`/`getAdsCampaigns` are now dead code
  for the Ads page itself, but still used by `app/(dashboard)/leads/page.tsx`'s
  `LeadsJourney` for the simulated half of "Impresiones" (see below) — 
  don't delete them.
- **Real finding, not a bug**: Lumiservicios' Google Ads account shows
  real spend/conversions only through **2026-07-17**, then drops to zero
  even though the 3 non-removed campaigns are still `ENABLED` — worth the
  client checking why in the Google Ads UI directly (budget, billing,
  disapproval, etc.), not something this dashboard can diagnose or fix.

## Done since the redesign, continued (2026-08-11)

- **Leads table (`/leads`) is connected to a real database** —
  `lib/db.ts` (pg `Pool`) + `lib/leads-db.ts` (`insertLead`/
  `getLeadsFromDb`), reading/writing a `leads` table in Postgres. Verified
  live end-to-end (insert + select round-trip via `curl` against
  `/api/leads/ingest`, then confirmed via `psql`) before wiring the page.
  - **Where the database lives**: Railway, not Coolify — project
    "Pixolab Dashboards" (shared across every future client dashboard,
    not just Lumiservicios; tenancy is a `client` column, see
    `db/migrations/001_leads.sql`), provisioned directly from this
    session since the Railway CLI was already installed + authenticated
    locally. Full details: `pixolab-dashboards/_infra/README.md`. An
    earlier plan to put this on Coolify was explored and superseded — see
    `pixolab-server/docs/todo-pixolab-dashboards-db.md`, now just a paper
    trail, not a pending task.
  - **`/api/leads/ingest`** (`app/api/leads/ingest/route.ts`) is the
    webhook the GTM tag posts to — shared-secret header
    (`x-ingest-secret`, `LEADS_INGEST_SECRET` env var), zod-validated,
    CORS locked to `https://lumiservicios.com`. The secret is **not**
    real security (it ships in client-side JS, anyone can read it in
    devtools) — it's there to cut drive-by noise, not to gate a motivated
    attacker.
  - **Still blocked on deployment**: GTM runs in real visitors' browsers
    on the live site — it can't reach `localhost`. The ingest endpoint
    only receives real leads once this dashboard is deployed somewhere
    public (still not done, see "Not deployed anywhere" below) and the
    GTM tag is updated to POST to that URL (snippet prepared, given to
    the user, not yet pasted into GTM — that's on them, this session has
    no GTM access).
  - Deliberately **not** a direct connection to WordPress's CF7DB MySQL
    tables — would need the WP host to allow external DB connections
    (most don't by default) and breaks silently if the plugin's schema
    ever changes.
  - **Historical CF7DB entries were backfilled 2026-08-11** — the client
    exported both forms as CSV from CFDB7's own UI and pasted them in;
    `scripts/import-historical-leads.mjs` parsed and inserted them
    directly (bypassing `insertLead`, which always stamps `now()` — this
    needed each row's *original* submission timestamp instead). 57 leads
    imported: 18 `form_submitted` (2026-05-04 → 2026-08-06), 39
    `catalog_download` (2026-04-24 → 2026-08-11). Session timezone set to
    `America/Mexico_City` before inserting so CFDB7's naive timestamps
    land on the right UTC instant. Not idempotent, not wired into the
    app — a run-once-by-hand tool; re-running the same CSV would
    duplicate rows (no dedupe key). If the client sends more historical
    exports later (rare, but possible), same script, same pattern.
  - **The Leads table shows date *and* time** (`components/leads-table.tsx`),
    always in `America/Mexico_City` regardless of what timezone the
    browser or server happens to be in — `Intl.DateTimeFormat` with an
    explicit `timeZone` option, not relying on the runtime's local zone.
  - **`next.config.ts` pins `process.env.TZ = "America/Mexico_City"`** for
    the whole app, set before Next boots. This matters for every
    server-rendered date-only string across the app (every page header's
    `format(parseISO(range.startDate), ...)`) — without it, those resolve
    against whatever timezone the host machine defaults to, which can
    silently shift a date-only value by a day once this deploys somewhere
    that isn't already set to Mexico time (Railway/Coolify hosts commonly
    default to UTC; this dev machine happens to already be
    America/Mexico_City, which is why the bug wouldn't have shown up
    locally). If a future client dashboard serves a different timezone,
    change this constant for that repo — it's not shared config.

## Done since the redesign, continued (2026-08-12)

- **Fixed: OpenPanel's Insights API silently returned all-zero for any
  single-day range** (`startDate === endDate`, exactly what "Hoy"/"Ayer"
  build) — the API treats the range as half-open (`endDate` excluded).
  Verified live: `/overview?startDate=X&endDate=X` → all zero;
  `endDate=X+1day` → the real numbers. Fixed once, centrally, in
  `lib/openpanel.ts`'s `toApiParams()` (bumps `endDate` by one calendar
  day at the query boundary only — display code/labels still use the
  real inclusive range). This is what was behind the "Ads shows 7
  conversions yesterday but Conversiones shows none" report — not a
  WhatsApp-vs-lead classification bug, the whole dashboard was blind to
  "today"/"yesterday" before this fix. Separately, that same
  investigation found one of the 7 Ads conversions ("Búsqueda de
  producto" campaign) is `clic_en_cotización_poste_conico` — a Google
  Ads-native conversion tag on a quote button, not wired to
  OpenPanel/GTM at all; flagged to the client, not built.

- **Auth: invite-gated email+password login, "Compartir" button in the
  Topbar** (Drive-style — invite by email, revoke access; no separate
  admin panel, this modal is the whole permission system, per explicit
  request). Chosen over magic-link/Google-only because the client
  specifically wanted email+password with an invite-to-register flow.
  - **Schema**: `db/migrations/003_auth.sql` — `users` (password_hash
    starts NULL until invite accepted), `auth_tokens` (invite/reset,
    purpose-tagged, hashed), `sessions` (opaque token, hashed). Same
    Railway Postgres as `leads`, same `client` tenancy column pattern.
    Neither tokens nor session cookies are ever stored raw — only their
    SHA-256 hash (`lib/auth/tokens.ts`) — a DB dump alone can't log in as
    anyone or replay an invite link.
  - **Core logic**: `lib/auth/` — `passwords.ts` (bcryptjs, not argon2:
    pure JS, no native build step, fine for a small invite-only list),
    `tokens.ts`, `session.ts` (`createSession`/`getCurrentUser`/
    `requireUser`/`destroySession`, cookie name split into
    `constants.ts` so `middleware.ts` can read it without pulling in
    `pg`), `users.ts` (invite/revoke/accept/login/reset, plus
    `canManageAccess()` — **only `@pixolab.com.mx` emails can
    invite/revoke**; anyone invited can view once registered, this only
    gates the sharing UI), `email.ts` (Resend, invite + reset emails —
    **`RESEND_API_KEY`/`EMAIL_FROM` not filled in yet**, invites fail
    with a clear in-dialog error until that's done, see
    `.env.local.example`).
  - **Pages**: `/login`, `/invite/[token]`, `/forgot-password`,
    `/reset-password/[token]` — standalone, no Topbar, live outside the
    `app/(dashboard)/` route group on purpose (must render while logged
    out). Password reset kills every other active session for that user.
  - **Route structure changed**: every existing page moved into
    `app/(dashboard)/` (a route group — doesn't affect URLs) so
    `app/(dashboard)/layout.tsx` can gate all of them behind
    `requireUser()` in one place, and render the Topbar/footer only
    there (auth pages don't get them). `app/layout.tsx` (root) is now
    just fonts/theme provider. `middleware.ts` does a cheap Edge-safe
    "is there a session cookie at all" redirect first (can't touch `pg`
    or `next/headers`'s `cookies()` in Edge runtime); the real
    DB-validated check is the layout. `/api/leads/ingest` stays outside
    the group and outside auth entirely — it's the public GTM webhook,
    gated by its own shared secret, explicitly allow-listed in
    `middleware.ts`.
  - **Compartir modal** (`components/share-dialog.tsx`) deliberately
    does **not** rely on `revalidatePath` + the server layout re-passing
    props to refresh its list — that was tried first and had a bad
    side effect: revalidating the `"layout"` scope remounted the whole
    client subtree on the currently-open page, silently closing the
    dialog and losing in-progress error state right after a mutation.
    Fixed by giving it its own read-only `getCollaboratorsAction()` it
    calls directly after invite/revoke — see the comment in
    `app/(dashboard)/share-actions.ts`. Worth remembering for any future
    "always-open, self-refreshing" client widget in this app.
  - **Bootstrapping the first user**: `scripts/create-first-user.mjs`
    (run: `node --env-file=.env.local scripts/create-first-user.mjs
    [email]`, defaults to `efragoso@pixolab.com.mx`) — inserts the user
    row and prints an invite link instead of emailing it, sidestepping
    both the chicken-and-egg problem (every other user is invited *by*
    someone already logged in) and the not-yet-configured Resend key.
  - **Gotcha hit while wiring this up**: `requireUser()` can call
    `redirect()`, which throws a special Next.js signal — it must never
    sit inside a `try/catch` that catches generically, or the redirect
    gets silently swallowed and turned into an error response instead.
    Every Server Action here calls it *before* entering its own
    try/catch, not inside.
  - **Not done**: `RESEND_API_KEY`/`EMAIL_FROM` (see above — invites
    currently show a clear error instead of sending); a "forgot your
    invite link" resend button (currently: re-invite the same email,
    it reuses the row and issues a fresh token); renaming
    `middleware.ts` → `proxy.ts` (Next 16.3 flags the old convention as
    deprecated but still fully supports it — cosmetic, not urgent).

## Done since the redesign, continued (2026-08-18)

- **App-wide rename to "Pixolab Analytics"** — the product identity shown
  on every page that isn't scoped to one specific client (root
  `<title>`/metadata in `app/layout.tsx`, the login/forgot-password
  `AuthCard` copy, the reset-password email's subject/branding in
  `lib/auth/email.ts`, the post-login picker's header). Previous copy
  ("Lumiservicios — Dashboard", "Pixolab Dashboards") was left over from
  the single-tenant era and the pre-rename Railway project name — neither
  was ever the intended product name for this multi-tenant app.
  `components/auth-card.tsx` grew a small `ProductMark` (icon + "Pixolab
  Analytics" wordmark) shown above the page-specific title on every
  standalone auth page, so that identity is now consistent across
  login/invite/forgot/reset — previously only the per-client favicon
  showed, with no product-level branding at all. `lib/db.ts`'s and
  `lib/leads-db.ts`'s doc-comment mentions of "Pixolab Dashboards" were
  **not** touched — those name the actual Railway project, a real
  external identifier, not app-facing copy.
- **The post-login picker (`app/(dashboard)/page.tsx`) now always shows**,
  even with exactly one accessible client — previously it silently
  redirected straight to that one dashboard, skipping the picker
  entirely, which was the overwhelmingly common case (every non-staff
  user has exactly one). Changed on explicit request: every login should
  land on "which dashboard(s) am I in" first, not skip it implicitly.
  Picker cards got a redesign pass (favicon + name + domain subtitle,
  hover lift) — kept the entrance animation dead simple
  (`animate-in fade-in slide-in-from-bottom-*` only, no explicit
  `opacity-0` base + `fill-mode-forwards` + per-item stagger) after that
  combination shipped invisible cards in a real browser check — the DOM
  had the right content (confirmed via `get_page_text`) but every card
  sat at `opacity-0` with nothing overriding it, so the "which utility
  wins" cascade with `tw-animate-css` isn't safe to assume; the simpler
  pattern used elsewhere in this file (`AuthCard`) was verified working
  and is what both now share.
- **NUMA Ingeniería added as a second `clients` row** (slug `numa`,
  `favicon_path`/`allowed_origin` still `NULL`) — see "Not yet done" above
  for what's still missing before its dashboard pages show real data.
  Picking it from the login picker and visiting any of its pages already
  works end-to-end *as a graceful degradation*: `getClientConfig` throws
  a clear "Missing CLIENT_NUMA_OPENPANEL_CLIENT_ID..." error, and every
  page's existing try/catch renders that as a normal `ErrorCard` — no
  crash, confirmed live.

## Done since the redesign, continued (2026-08-19)

- **Fixed: the whole app was silently broken on real mobile viewports —
  not a per-component styling issue, one root overflow was forcing every
  page's *entire layout viewport* wider than the screen.** Reported as
  "the modal overflows on mobile" and "the topbar with Compartir doesn't
  fit," but those were symptoms, not separate bugs. Root-caused live at a
  375px viewport: `Topbar`'s top-row action group (date range + Compartir
  + Exportar PDF + theme + account, all in one non-wrapping flex row with
  no shrink/scroll) needed 584px against ~327px available — confirmed via
  `element.scrollWidth` vs `clientWidth` on every element on the page,
  not by eyeballing a screenshot (screenshots of this bug were
  misleading: `window.innerWidth` itself reported 608, not 375, because
  the overflow forced the browser to widen its whole layout viewport to
  fit the unwrapped row — every fixed-position element on the page,
  including dialogs, was then computing `100%` against that wrong 608px
  width, which is why the page-detail-modal's text also appeared to
  overflow even though the modal component itself had no bug). Fixed at
  the source in `components/topbar.tsx`: action buttons compress on
  mobile (`ShareDialog`'s "Compartir" label and the brand's client-name
  text hidden below `sm:`, matching the existing pattern already used for
  `ExportPdfButton` and the "Dashboard" badge; `DateRangePicker`'s label
  capped to `max-w-[92px]` with `truncate` below `sm:`), plus the action
  row and `SectionNav` both got `overflow-x-auto` as a safety net so a
  future long client name or extra button degrades to "swipe to see the
  rest" instead of breaking the page-wide viewport again. Verified fixed
  by the same `scrollWidth`/`clientWidth` sweep returning zero overflowing
  elements on all 7 routes, and `window.innerWidth` correctly reporting
  375 again.
- **`components/ui/dialog.tsx` hardened against the actual modal-text-
  overflow class of bug**, independent of the Topbar fix above (both were
  real, just compounding): `DialogPrimitive.Popup` is a CSS grid, and
  grid items default to `min-width: auto` (their content's min-content
  size) unless overridden — a long unbroken sentence (a recommendation in
  `PageDetailModal`, a permalink) was sizing its grid item wider than the
  dialog's own `max-width`, spilling text past the rounded card edge
  instead of wrapping/truncating. Fixed once, for every dialog in the
  app, with `[&>*]:min-w-0` on `DialogContent` plus `overflow-hidden` as
  a second guard. Confirmed inner Base UI popups (Select, etc.) are
  unaffected — they render via `Portal`, outside `DialogContent`'s DOM
  subtree, so clipping it doesn't touch them.
- **Tables get a shared `components/table-scroll.tsx` (`TableScroll`)**
  instead of a bare `overflow-x-auto` div — same functional scroll as
  before (confirmed these were never literally broken, just undiscoverable:
  columns past the fold were silently unreachable-*feeling* with zero
  visual hint that swiping revealed more), now with a right-edge fade so
  it reads as "swipe for more," not "the rest of the data is missing."
  Applied to all 5 tables in the app (`/performance`, `/leads`, `/seo`,
  `/ads`, `/social`). `/performance` and `/leads` additionally got a
  **sticky first column** (`sticky left-0 bg-card`, solid background
  since scrolled content passes underneath it) — those two are the
  tables someone most needs to keep the row's identity ("which page,"
  "which prospect") on screen while swiping through the metrics.
  `/leads`' source-filter `TabsList` (`w-fit` by default, three Spanish
  labels together don't fit a phone width) got the same
  `overflow-x-auto` treatment — previously just silently clipped past the
  card edge with no way to reach "Descarga de catálogo" at all, not
  merely undiscoverable like the tables.
- **Diagnostic technique worth keeping**: `resize_window` to a mobile
  preset in this environment's browser pane does *not* reliably reflect
  in `window.innerWidth`/`getBoundingClientRect()` when the page has a
  genuine horizontal-overflow bug (the reported "375" is the visual
  viewport; the layout viewport widens to fit overflowing content, and
  `innerWidth` tracks the latter) — screenshots alone were actively
  misleading here. The reliable check is a live sweep:
  `document.querySelectorAll('body *')` diffing each element's
  `scrollWidth` vs `clientWidth` where `overflowX === 'visible'`, plus
  comparing `document.documentElement.clientWidth` (the true visual
  viewport) against `scrollWidth` (what content actually needs). Zero
  results on that sweep is the real "no mobile overflow" signal, not a
  screenshot looking okay at a glance.

## Done since the redesign, continued (2026-08-21)

- **Fixed: SEO clicks/impressions undercounted vs. Search Console's own
  UI, for any range ending "today" (every preset here does).** Root
  cause: the Search Console API defaults to `dataState: "final"` when not
  specified, and Search Console typically takes ~2 days to finalize a
  day's data — confirmed live 2026-08-21: a 7-day query (Aug 15–21)
  returned exactly 0 clicks for Aug 20 and 21 with the default query, but
  24 and 1 real clicks respectively with `dataState: "all"` (95 → 120
  total for the same 7-day window). Search Console's own UI shows this
  same preliminary/"fresh" data by default (marked there as such), so the
  dashboard was silently lagging real numbers by up to 2 days on every
  range. Fixed in `lib/gsc.ts`'s `searchAnalyticsQuery` by always passing
  `dataState: "all"` — matches what Search Console's own UI shows,
  accepting the same trade-off it does (the most recent 1-2 days can
  shift slightly as Google finishes processing them).

## Not yet done
- **NUMA Ingeniería (`numa` slug) was added to the `clients` registry
  2026-08-18 but has no real credentials yet** — no `CLIENT_NUMA_*` env
  vars exist, so every page for it renders `getClientConfig`'s clear
  "Missing CLIENT_NUMA_OPENPANEL_CLIENT_ID..." `ErrorCard` instead of
  crashing (confirmed live). It already shows up correctly in the login
  picker (favicon-less, falls back to the "N" letter avatar) and in the
  Topbar once you're on `/numa/*`. To make it real: same setup as
  Lumiservicios — an OpenPanel "Read" client for NUMA's existing OpenPanel
  project (see `pixolab-openpanel/CLAUDE.md`, NUMA is already tracked
  there), a GSC service-account grant on NUMA's property if SEO should
  work, and a Google Ads customer ID if Ads should work. `favicon_path`
  and `allowed_origin` are also still NULL on its `clients` row — fill
  those in once there's a real favicon asset and a leads-ingest domain to
  allow.
- **Leads/Conversiones page's true 3rd funnel step** (actual closed sale)
  doesn't exist anywhere yet. WhatsApp clicks are a dead end for this — no
  way to trace a click to a sale. Form submissions *are* traceable in
  principle by cross-referencing CF7DB against Twenty CRM, but that
  cross-reference isn't built. The "3-step" `Formulario de contacto` /
  `Descarga de catálogo` funnels on `/conversiones` that do exist are a
  different thing — visit → page view → conversion, not visit →
  conversion → closed sale.
- **Social has no real source.** See "Mock data" above for exactly how to
  swap it out once Meta Graph API / TikTok for Business access exists.
- **The top journey indicator's "Impresiones" stage is still fully
  simulated** even though both SEO and Ads are now real — it currently
  sums `lib/mock-data.ts`'s simulated ad impressions + simulated SEO
  impressions untouched. Swapping both halves to real (`lib/gsc.ts` +
  `lib/google-ads.ts`) is a small follow-up in `app/(dashboard)/conversiones/page.tsx`'s
  `LeadsJourney`, just not done yet.
- **Historical traffic/lead data before OpenPanel (2026-07-17) was
  explicitly descoped** by the client for now (GA4 traffic history, and
  cross-referencing pre-OpenPanel leads). One relevant fact surfaced while
  investigating, worth knowing if this comes back up: Google Ads'
  conversion actions ("objetivos") named exactly `WhatsApp` and
  `Formulario de contacto` have real historical data from **2026-04-21 to
  2026-07-17** (180 and 48 conversions respectively, verified live via
  `google-ads-api`'s `conversion_action` + `segments.conversion_action_name`
  — Google Ads counts fractionally per its attribution model, won't match
  OpenPanel's per-event counts exactly). Revisit later if asked; don't
  build either without being asked again.
- **Not deployed anywhere.** Local dev only so far. Open question before
  deploying: serve it at a **subdomain**
  (`lumiservicios.analytics.pixolab.com.mx` or similar) vs. a **path**
  under the existing analytics domain. Leaning subdomain — avoids
  clashing with OpenPanel's own dashboard frontend routes on that domain
  and avoids Next.js `basePath` complications. Not decided yet, decide
  with the user before deploying. When ready, deploy as its own Coolify
  service — same pattern as OpenPanel itself, see `pixolab-server`.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
```

Fill in `.env.local` — needs a **Read**-type OpenPanel API client (not the
`write` one used for the GTM tracking snippet, that one can't access this
API):

1. `https://analytics.pixolab.com.mx` → Lumiservicios project → **Settings
   → Clients → Create a client**
2. Name it e.g. `Dashboard Read`, type **Read**
3. Copy Client ID + Secret from the success screen into
   `OPENPANEL_CLIENT_ID` / `OPENPANEL_CLIENT_SECRET`

```bash
pnpm dev
```

Dev server launch config lives in `.claude/launch.json` (for the
`preview_start` tool) — points at `pnpm dev` on port 3000.

## Architecture

- `lib/openpanel.ts` — the only file that talks to OpenPanel. Server-only
  (never import from a Client Component — the secret must stay
  server-side). Auth headers: `openpanel-client-id` /
  `openpanel-client-secret` (**not** a bearer token — that's the MCP auth
  scheme, different thing, this dashboard uses the REST Insights API, not
  MCP). Every exported function's return type was verified against a real
  response, not guessed from source — see the comment at the top of the
  file and don't trust a type here you haven't re-verified if the
  OpenPanel API changes.
- `components/ui-kit.tsx` — dashboard-specific presentational components
  (`PageHeader`, `StatCard`, `Section`, `SimulatedBadge`, `ErrorCard`,
  `ComingSoon`) built on top of `components/ui/card.tsx` etc. This is
  distinct from `components/ui/` (raw shadcn primitives) — extend this
  file for new dashboard-shaped UI, extend `components/ui/` only via the
  shadcn CLI.
- `components/topbar.tsx` — sticky header: brand mark, section nav (active
  state via `usePathname`), the date range picker, and the export button.
  Replaces the old plain `components/nav.tsx` (deleted in the redesign).
- Every data page is an async Server Component that `try/catch`s its
  fetch **before** returning JSX (not inside a JSX-returning try block —
  that trips the `react-hooks/error-boundaries` lint rule and, more
  importantly, doesn't actually catch render errors in React anyway) and
  renders `<ErrorCard>` on failure instead of crashing the page.

### Gotchas specific to the OpenPanel API integration

- `/funnel`'s `steps` param must be sent as **repeated query params**
  (`?steps=a&steps=b`), not a JSON-encoded array or comma-separated string
  — see `getFunnel`'s use of `opFetchMulti` in `lib/openpanel.ts`, it's a
  separate helper from the normal single-value `opFetch` for this reason.
- `/overview`'s `bounce_rate` is **0-100**, not 0-1 — don't multiply by
  100 again when formatting.
- There's an older `/metrics` legacy endpoint with a similar-but-different
  shape (`{metrics: {...}, series: [...]}` vs `/overview`'s `{summary:
  {...}, series: [...]}`) — this dashboard uses `/overview` throughout,
  don't mix the two.

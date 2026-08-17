# Lumiservicios — custom analytics dashboard

Next.js dashboard replacing Looker Studio for lumiservicios.com. Pulls
directly from our self-hosted OpenPanel instance's REST API, plus (over
time) other sources OpenPanel can't hold: Search Console, ad spend, CRM.

Neutral, unbranded design system (shadcn/ui on Base UI + Recharts, Manrope
+ IBM Plex Mono, no serif/brand accent) with a real light/dark toggle via
`next-themes` — see `CLAUDE.md` "Design system" before touching any visual
code. Global date-range picker (top bar, with presets and a custom range
calendar) drives every page's data fetch, and a PDF export button
screenshots the current page.

Sections: **Tráfico general**, **Performance**, **Leads** (real prospects
table backed by Postgres — name/email/phone/source/detail/date, filterable,
click a row to qualify a lead; WhatsApp excluded, no CRM access to those
conversations), **Conversiones** (real OpenPanel data — 3 embudos: WhatsApp,
formulario de contacto, descarga de catálogo), **SEO** (real data, direct
Search Console connection), **Publicidad** (real data, direct Google Ads
connection — see below) · **Social media** (simulated data, clearly badged,
until Meta/TikTok APIs are connected).

Access is invite-gated (email + password) — see "Access / auth" below.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
```

Then fill in `.env.local`:

1. Log in to `https://analytics.pixolab.com.mx`, open the **Lumiservicios**
   project → **Settings → Clients → Create a client**.
2. Name it something like `Dashboard read`, type **Read** (not Write —
   the default write client used for the GTM tracking snippet can't access
   this API).
3. Copy the **Client ID** and **Secret** from the success screen into
   `OPENPANEL_CLIENT_ID` / `OPENPANEL_CLIENT_SECRET`.
4. For SEO data: create a Google Cloud service account with the Search
   Console API enabled, add its email as a Restricted user on the property
   in Search Console, then fill in `GSC_SITE_URL` (exact property format —
   `sc-domain:...` or `https://...`, they're not interchangeable),
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
   Full walkthrough in `.env.local.example`'s comments.
5. For Ads data: get a Developer Token from a Google Ads Manager (MCC)
   account, an OAuth client (Desktop app type) from Google Cloud, then run
   `node --env-file=.env.local scripts/get-google-ads-refresh-token.mjs`
   for the one-time interactive step that gets you a refresh token. Full
   walkthrough in `.env.local.example`'s comments.
6. For the Leads database: `DATABASE_URL` points at the shared Postgres
   for the whole Pixolab Dashboards ecosystem (Railway, not per-client —
   see `../_infra/README.md` in this repo's parent folder for the actual
   project/credentials). `LEADS_INGEST_SECRET` is a random string the GTM
   tag sends back to prove it's not random internet noise (not real
   security, see `app/ingest/leads/[client]/route.ts`'s doc comment).
7. For login emails (invite + password reset): `RESEND_API_KEY` (from
   resend.com, needs `pixolab.com.mx` verified as a sending domain),
   `EMAIL_FROM`, and `APP_URL` (the base URL invite/reset links point at
   — `http://localhost:3000` in dev). Until these are filled in, inviting
   someone from the Compartir modal fails with a clear in-dialog error
   instead of silently doing nothing.
8. Run the migrations (`db/migrations/*.sql`, in order) against
   `DATABASE_URL`, then create the first user — there's no seed data and
   no way to invite yourself from inside the app:
   ```bash
   node --env-file=.env.local scripts/create-first-user.mjs your@email.com
   ```
   Prints an invite link to the console (doesn't need `RESEND_API_KEY` —
   this is the one path that bypasses email entirely, see the script's
   own comment for why). Open that link to set a password and log in;
   from there, invite everyone else through the Compartir button.

```bash
pnpm dev
```

## Access / auth

Invite-gated email + password, not open registration. The **Compartir**
button next to the date-range picker (Drive-style) is the entire
permission system — no separate admin panel:

- Only `@pixolab.com.mx` emails can invite/revoke (see
  `lib/auth/users.ts`'s `canManageAccess`); anyone invited can view the
  dashboard once they've set a password.
- Inviting someone emails them a link (`/invite/[token]`, 7-day expiry)
  to set a password; "Quitar acceso" is a hard delete — instant logout
  everywhere for that person.
- Full architecture, schema, and a couple of gotchas worth knowing before
  touching this code: `CLAUDE.md` → "Done since the redesign, continued
  (2026-08-12)".

## Data source

All pages read from OpenPanel's Insights REST API
(`lib/openpanel.ts`), authenticated with `openpanel-client-id` /
`openpanel-client-secret` headers — **not** the MCP server (a different
auth scheme, bearer token; MCP is available on this instance too as of
2026-08-04, see `pixolab-analytics/CLAUDE.md`, but this dashboard doesn't
use it) and not the `write` client used for tracking.

Response shapes in `lib/openpanel.ts` were verified against real live
responses (not just inferred from source) — see `CLAUDE.md` in this repo
for details and gotchas (funnel's repeated `steps` param, `bounce_rate`
being 0-100 not 0-1, `/overview` vs the older `/metrics` endpoint).

**SEO** and **Publicidad** are the exceptions — they read from Google
Search Console (`lib/gsc.ts`, service account) and Google Ads
(`lib/google-ads.ts`, OAuth refresh token) directly, **not** through
OpenPanel's own (unconfigured) integrations. See `CLAUDE.md`'s "bigger
plan" note for why.

## Deploying

Not deployed yet. When ready, this becomes its own Coolify service (see
`pixolab-server` for how the OpenPanel deploy was done — same pattern:
Coolify project → service from this repo → set a domain). Open question to
resolve before deploying: subdomain
(`lumiservicios.analytics.pixolab.com.mx`) vs. a path under the existing
analytics domain — leaning subdomain, to avoid clashing with OpenPanel's
own frontend routes and Next.js `basePath` complications.

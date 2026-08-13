# Transition notice — read this first (2026-08-12)

**If you're reading this in a folder called `pixolab-openpanel`**: that's
expected. This file was written in `/Volumes/1TB/www/pixolab-analytics`
right before that folder got renamed to `pixolab-openpanel`. Everything
below explains why, and where everything else went. A duplicate of this
file also lives in the *new* `pixolab-analytics` folder (see below) so the
full picture is readable from either side.

## What's happening

Two local folders are trading names/roles:

| Before | After | What it is |
|---|---|---|
| `/Volumes/1TB/www/pixolab-analytics` | `/Volumes/1TB/www/pixolab-openpanel` | OpenPanel's own source (clone of upstream `Openpanel-dev/openpanel`) — this repo you're in right now |
| `/Volumes/1TB/www/pixolab-dashboards/lumiservicios` | `/Volumes/1TB/www/pixolab-analytics` | Pixolab's multi-tenant client-dashboards Next.js app (was misleadingly nested under `pixolab-dashboards/`, now gets the top-level name it deserves) |
| `/Volumes/1TB/www/pixolab-dashboards/_infra` | `/Volumes/1TB/www/pixolab-analytics/_infra` | Notes for the shared Railway Postgres backing the dashboards app |

**Why**: the user wants the name "pixolab-analytics" to mean the
*dashboards product* going forward (what a Pixolab team member would
naturally call "the analytics dashboards"), not the OpenPanel engine
underneath it. OpenPanel is being renamed to its own clearly-scoped
`pixolab-openpanel` folder/repo.

**Two new GitHub repos, both under the `efragosogit` account**:
- `efragosogit/pixolab-analytics` — the dashboards app. **Already created
  and pushed as of this writing** (private repo,
  https://github.com/efragosogit/pixolab-analytics, `main` branch has the
  full multi-tenant rewrite).
- `efragosogit/pixolab-openpanel` — a Pixolab-owned copy of this OpenPanel
  source (currently only tracked via the upstream `Openpanel-dev/openpanel`
  remote, no Pixolab-owned mirror existed before now). Created as part of
  this same transition — check this repo's own git remotes
  (`git remote -v`) to see whether `origin` now points there and `upstream`
  points at the real upstream project.

## Why this matters if you're picking this up mid-task

We were in the middle of **deploying the dashboards app to production**
when this rename happened. Full context, in order:

1. Built a complete multi-tenant redesign of the dashboards app (auth with
   invite-gated email+password login, `clients`/`client_memberships`
   tables, per-client routing at `/{client}/...`, real integrations —
   OpenPanel, Google Search Console, Google Ads, a Postgres-backed leads
   table). All of this is documented in the dashboards app's own
   `CLAUDE.md` — see the new `pixolab-analytics` folder (post-rename) or
   `pixolab-dashboards/lumiservicios` (pre-rename) for the full technical
   writeup, "Multi-tenant architecture" section.
2. Wrote a `Dockerfile` (Next.js standalone output, multi-stage build) for
   that app. **Verified working locally**: `docker build` succeeds (after
   fixing a V8 heap OOM during `next build` with
   `NODE_OPTIONS=--max-old-space-size=4096` — same gotcha documented in
   `pixolab-server/docs/gotchas.md` #8 for other apps on this host), and a
   locally-run container **successfully reached the real production
   Railway Postgres and OpenPanel API** (verified via curl and a real
   browser session — real Lumiservicios data rendered).
3. Created the `efragosogit/pixolab-analytics` GitHub repo (private),
   pushed all the code there.
4. **Blocked here**: Coolify (where this needs to deploy) requires a
   *separate GitHub App installation per private repository* on this
   instance — there's no single "just works" private-repo credential.
   Every existing git-deployed app on this Coolify (`pixolab-erp`,
   `bcom-cms`, `guia-morada`) has its own dedicated GitHub App connection
   (see `pixolab-server/docs/api-cookbook.md` — though note that doc has
   **no worked example** of creating a Coolify "application" resource from
   a git repo at all; everything documented there is the OpenPanel-style
   compose *service template* flow, a different Coolify resource type).
   Installing a new GitHub App requires an interactive step on
   github.com (clicking through an install/authorize flow) — not doable
   via the Coolify API alone. This was still unresolved when the folder
   rename was requested.
5. The user then asked for this documentation pass + the folder rename +
   creating `pixolab-openpanel` as a second repo, before continuing.

## What's NOT done yet (pick up here)

- [ ] Resolve the private-repo GitHub App friction for
  `efragosogit/pixolab-analytics` so Coolify can clone it — either install
  a dedicated GitHub App for it (user needs to do the GitHub-side click-
  through), or reconsider making that repo public (would let it use the
  existing zero-config "Public GitHub" source already registered in
  Coolify, id `0`/`jy8jbe45d37lgmzl9h28swpr` — no extra setup).
- [ ] Create the actual Coolify **application** (not service) for the
  dashboards app — `build_pack: "dockerfile"`, `dockerfile_location:
  "/Dockerfile"`, `ports_exposes: "3000"`, modeled on `pixolab-erp`
  (uuid `vw2x9s2lhjk3pugt4f1hmyon`) — inspect that app's full object via
  `GET $BASE/applications/vw2x9s2lhjk3pugt4f1hmyon` for the exact shape;
  there's no POST example recorded anywhere, this will need to be
  discovered live (try `POST $BASE/applications/dockerfile` first — that's
  the Coolify-upstream-documented endpoint name for this source type,
  unverified against this specific instance/version).
- [ ] Deploy first to a throwaway `sslip.io` domain, verify health +
  real Postgres/OpenPanel/GSC/Ads connectivity from Coolify's actual
  network (not just from this dev Mac).
- [ ] Fill in real `RESEND_API_KEY`/`EMAIL_FROM` (still blank — invites
  currently fail with a clear in-app error instead of silently doing
  nothing).
- [ ] Only once the above is solid: point `analytics.pixolab.com.mx` at
  the new app (currently OpenPanel's domain), then move OpenPanel to
  `openpanel.pixolab.com.mx` — **but keep OpenPanel's `/api` answering on
  the OLD domain during a transition window**, because every live client
  site's GTM container has `apiUrl: 'https://analytics.pixolab.com.mx/api'`
  hardcoded — cutting that over abruptly silently kills analytics
  tracking for every client until each GTM container is manually updated
  and republished. Full staged-cutover reasoning is in the dashboards
  app's `CLAUDE.md`.
- [ ] DNS: `analytics.pixolab.com.mx` already resolves to `164.68.119.35`
  (this Coolify server). `openpanel.pixolab.com.mx` needs the same A
  record — user is adding it in Dynadot themselves; confirm it resolves
  before touching anything in Coolify.

## Coolify access (for whoever continues this)

- **API base**: `http://server.pixolab.com.mx:8000/api/v1`
- **API token**: `pixolab-server/.secrets.env`, key `COOLIFY_API_TOKEN` —
  read it with `TOKEN=$(grep COOLIFY_API_TOKEN pixolab-server/.secrets.env | cut -d= -f2)`
- **SSH** (for on-server verification, per `pixolab-server/docs/gotchas.md`'s
  warning to never trust the API's env-listing alone):
  `ssh -i pixolab-server/.ssh/coolify_agent_ed25519 root@server.pixolab.com.mx`
- **Server**: one VPS (Contabo), public IPv4 `164.68.119.35`, Coolify
  server uuid `ro6vn78vevt8nyqibroxpbgl`, destination/network uuid
  `ku3og7n75574tnwoujq0890c` (both needed when creating a new
  application/service via the API).
- **OpenPanel's current Coolify service** (about to get a second domain,
  not moved yet as of this writing): project uuid `ismsu82wx3ezmvg0sg09vxvv`,
  service uuid `dfmu33iyrka4hg4ywmpqxa35`, dashboard+API both currently on
  `analytics.pixolab.com.mx`.
- **Existing GitHub Apps registered in Coolify** (`GET $BASE/github-apps`):
  id 0 = "Public GitHub" (works for any public repo, zero setup), id 1 =
  `guia-morada`, id 2 = `pixolab-erp`, id 3 = `bcom-cms` — each private-repo
  ID is scoped to exactly one repo via its GitHub `installation_id`. No
  entry exists yet for `pixolab-analytics` or `pixolab-openpanel`.
- Full ops context (SSH keys, gotchas, project inventory, playbooks) lives
  in `pixolab-server/CLAUDE.md` and `pixolab-server/docs/*.md` — that's a
  sibling folder, not this one.

## Full technical write-up

Everything about the dashboards app itself (schema, auth design, routing,
data layer, what's real vs. simulated per data source) is documented in
that app's own `CLAUDE.md` — don't duplicate it here, go read it directly
in whichever folder it currently lives in (`pixolab-analytics` post-rename,
`pixolab-dashboards/lumiservicios` pre-rename).

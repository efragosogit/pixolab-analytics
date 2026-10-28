# _infra

Not an app — just a placeholder directory used to run `railway` CLI
commands when provisioning the **Pixolab Dashboards** ecosystem's shared
infrastructure (currently just a Postgres database). Nothing here gets
deployed; there's no code in this folder on purpose.

## Current: Coolify Postgres on the Pixolab-apps server (since 2026-10-28)

The database lives as a Coolify resource, in the same project and on the
same server as the app:

| | |
|---|---|
| Resource | `pixolab-analytics-postgres`, uuid `qxgbhzlyt15spit3ud4uiibp` |
| Project / server | "Pixolab Analytics" (`h6yhv2d5p7exnlpfi87efzq6`) on `Pixolab-apps` (server #1) |
| Image | `postgres:16-alpine`, 256m memory limit |
| Database / role | `pixolab_dashboards` / `pixolab_dashboards_app` |
| Access | **Private** — no public port. The app reaches it over Coolify's Docker network at host `qxgbhzlyt15spit3ud4uiibp:5432` (the app's `DATABASE_URL`, set in Coolify) |

Because it is private, a dev machine can't reach it directly. Run
`pnpm db:tunnel` ([scripts/db-tunnel.sh](../scripts/db-tunnel.sh)) in its own
terminal: it opens `127.0.0.1:5433` → the DB container over SSH to
`Pixolab-apps`, looking up the container's current private IP on each run.
Keep `DATABASE_URL` in `.env.local` as
`postgres://pixolab_dashboards_app:<password>@127.0.0.1:5433/pixolab_dashboards`
(the password is the `postgres_password` of the Coolify resource). It needs
the `coolify_agent_ed25519` key from `pixolab-agents/pixolab-cloud/.ssh/`
(override the path with `PIXOLAB_SSH_KEY`). **This is the real production
database, not a copy** — `pnpm dev` and the scripts in `scripts/` read and
write live data.

History: Railway (2026-08-11) → Coolify resource on `pixolab-infra`, public
port 25659 (2026-08-25) → this one (2026-10-28), moved so the database sits
next to the app and needs no public port. A `pg_dump -Fc` taken just before
the move is in `pixolab-agents/pixolab-cloud/backups/` (gitignored). The
`pixolab-infra` resource `pcsgtwm0dbnsikv0rus3lnab` was the previous home;
it was deleted on 2026-10-28 (volume included), so that dump is the only copy
of the pre-move state.

Everything below this line describes the original **Railway** setup and is
kept only as history.

## Pixolab Dashboards (Railway project) — historical

Created 2026-08-11. Railway CLI was already installed + authenticated as
`efragoso@pixolab.com.mx` on this machine — provisioned directly, no
Coolify/pixolab-server involvement (that path was explored first, see
`pixolab-server/docs/todo-pixolab-dashboards-db.md` — superseded, left in
place as a paper trail, not acted on).

- Project: **Pixolab Dashboards**, id `aafd15c7-b677-4650-a6fe-603c315ff90d`
- Service: **Postgres**, id `dbd494bc-73a0-42cf-90b0-8f3a4204d30a`
- Public TCP proxy: `altaria.proxy.rlwy.net:54488` → forwards to the
  container's port 5432. Created via `railway tcp-proxy create --port 5432
  --service Postgres` (the CLI's `railway domain` command only makes HTTP
  domains, wrong tool for a database — don't reach for it here again).
- Database: `pixolab_dashboards` — **shared across every client
  dashboard**, not one database per client. Tenancy is a `client` column
  on each table (e.g. `leads.client = 'lumiservicios'`).
- App role: `pixolab_dashboards_app` — scoped to just this database (not
  the `postgres` superuser Railway provisions by default). Connection
  string lives in each dashboard repo's own `.env.local`
  (`pixolab-dashboards/lumiservicios/.env.local` today), never here.
- Schema: `pixolab-dashboards/lumiservicios/db/migrations/001_leads.sql`
  is the only migration so far (run by hand via `psql`, no migration
  runner set up yet — one table isn't worth it, revisit if a second
  migration shows up).

## Adding a second client dashboard later

**Superseded 2026-08-12**: the "one dashboard repo per client" model this
section originally assumed is gone — `pixolab-dashboards/lumiservicios`
is now a **shared multi-tenant app** serving every client from one
deployment (`analytics.pixolab.com.mx/{client}/...`). Onboarding a new
client no longer means a new repo/`.env.local` — it means a new row in
that app's `clients` table plus a `CLIENT_<SLUG>_*` env var block. See
`pixolab-dashboards/lumiservicios/CLAUDE.md`'s "Multi-tenant architecture"
section for the real, current shape. This Postgres (shared, not
per-client — that part is still true) is what backs it either way.

## Useful commands

Run from this directory (or pass `--project aafd15c7-b677-4650-a6fe-603c315ff90d`
from anywhere):

```bash
railway variable list --service Postgres --json   # connection details
railway connect Postgres                          # psql shell, interactive
railway status
```

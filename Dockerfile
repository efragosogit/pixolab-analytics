# Multi-stage build for the multi-tenant Pixolab Dashboards app (Next.js
# 16, App Router). Produces a small runtime image via `output: "standalone"`
# (next.config.ts) — the runner stage ships only the traced node_modules
# subset + built assets, not the full dependency tree or source.
#
# Secrets are NEVER baked in here — every CLIENT_<SLUG>_*, DATABASE_URL,
# RESEND_API_KEY etc. is injected at container runtime by Coolify's env
# vars, not copied in at build time. .dockerignore excludes .env* from the
# build context entirely as a second line of defense.

FROM node:22-alpine AS base

# --- deps: install exactly what's in the lockfile, nothing more ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# --- builder: compile the app ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
# V8's default old-space heap ceiling (~2GB) is not enough for this build
# (Next.js compile + typecheck together) and OOMs with a "Mark-Compact"
# crash even when the host/container has plenty of RAM — this is a known
# gotcha on the target VPS too (pixolab-server/docs/gotchas.md #8), not
# real memory pressure. Raise it explicitly rather than assuming more
# container memory fixes it.
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm build

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Pin the container to Mexico City time. next.config.ts also sets
# `process.env.TZ` as a module-level side effect, which covers `next dev`
# and `next start` — but this image's CMD runs the standalone build's
# `server.js` directly, which does NOT re-execute next.config.ts's code at
# boot, so that assignment never happens here. Confirmed live 2026-08-13:
# without this, the container's Node process resolves to UTC
# (`Intl.DateTimeFormat().resolvedOptions().timeZone` → "UTC"), so every
# `startOfToday()`-based preset in `lib/date-range.ts` ("Hoy"/"Ayer"/etc.)
# silently computes against the wrong calendar day once UTC has rolled
# over past Mexico City's local midnight (from ~6pm CDMX onward) — "Hoy"
# resolves to tomorrow (no data yet) and "Ayer" resolves to today's
# partial day. Setting TZ as a real container env var (read directly by
# Node/V8 at process start, before any app code runs) fixes it
# unconditionally, independent of whether next.config.ts's side effect
# survives in this build output.
ENV TZ=America/Mexico_City

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

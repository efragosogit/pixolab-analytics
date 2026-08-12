import type { NextConfig } from "next";

// Pin the whole Node process to Mexico City time, regardless of what
// timezone the machine actually running this (dev laptop, or wherever it
// eventually deploys — Railway/Coolify hosts commonly default to UTC) is
// set to. Without this, every server-rendered date-only string
// (`format(parseISO(range.startDate), ...)` etc., used throughout
// app/*/page.tsx for page header date ranges) would resolve "local time"
// against the host's zone, which can shift a date-only value by a day
// near midnight in either direction. Set *before* Next boots — env vars
// set later (e.g. in a component) are too late, Node reads TZ once at
// startup. The Leads table separately pins `Intl.DateTimeFormat` to
// `America/Mexico_City` explicitly (see components/leads-table.tsx) since
// that one runs client-side too, where this server-only env var doesn't
// reach — keep both, they cover different runtimes.
process.env.TZ = "America/Mexico_City";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server serve its client JS/HMR to requests coming in via
  // Tailscale (or any other non-localhost host) instead of silently
  // blocking them — without this, the HTML renders fine but every "use
  // client" bundle (charts, the theme toggle, etc.) 404s/blocks, so nothing
  // interactive ever hydrates. Add more hosts here if the team accesses
  // this dev server from other IPs.
  allowedDevOrigins: ["100.77.206.35"],
  // Traces the minimal set of node_modules a production server actually
  // needs into `.next/standalone` — the Dockerfile's runtime stage ships
  // only that (plus `public/` and `.next/static`, copied in separately),
  // not the full node_modules tree. Without this, `next start` in a
  // container needs the whole dependency tree present, which is both a
  // much larger image and requires devDependencies too.
  output: "standalone",
};

export default nextConfig;

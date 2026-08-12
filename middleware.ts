/**
 * Cheap, Edge-safe first gate: redirect to /login if the session cookie
 * is missing entirely. This is NOT the real auth check — it can't be,
 * `pg` and `next/headers`'s `cookies()` don't run in the Edge runtime
 * middleware uses. The real check (does this cookie map to a
 * non-expired session in Postgres?) happens in
 * app/(dashboard)/layout.tsx, a Server Component. A visitor with a
 * stale/forged cookie sails past this middleware and gets caught there
 * instead — this file only saves a wasted render for the common case
 * (no cookie at all).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/invite", "/forgot-password", "/reset-password"];

// The GTM lead webhook has its own shared-secret auth (see
// app/api/leads/ingest/route.ts) — it's called from the client's site,
// never has a session cookie, and must stay reachable regardless.
const PUBLIC_PREFIXES = ["/api/leads/ingest"];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};

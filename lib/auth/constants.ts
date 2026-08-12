/**
 * Split out from session.ts so middleware.ts (Edge runtime, can't import
 * `pg` or `next/headers`'s `cookies()`) can reference the cookie name
 * without pulling in the rest of the auth stack.
 */
export const SESSION_COOKIE = "lumi_session";

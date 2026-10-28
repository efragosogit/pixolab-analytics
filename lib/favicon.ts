/**
 * Fetches a client site's favicon once, when its domain is saved from the
 * wizard / Configuración, and stores it in `clients.favicon_path` as a
 * `data:` URL — the deployed container's `public/` isn't writable or
 * persistent, and storing the bytes means rendering never depends on a
 * third-party request. `next/image` serves `data:` sources as-is (no
 * optimizer, no `images.remotePatterns` needed).
 *
 * Source is Google's public favicon service (only the site's public domain
 * is sent), which returns a consistent PNG for any site; a site without an
 * icon gets Google's generic globe, which is still better than nothing.
 * Returns null on any failure — the UI then falls back to the letter
 * avatar it already uses.
 *
 * Server-only.
 */
const MAX_BYTES = 100_000;

export async function fetchFaviconDataUrl(origin: string): Promise<string | null> {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return null;
  }
  try {
    const res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Wraps a wide table (or anything else that needs horizontal scroll on
 * narrow screens) in `overflow-x-auto` plus a right-edge fade hinting
 * there's more to swipe to — same fix applied to `SectionNav` in
 * `components/topbar.tsx`. Every table in this app (`/performance`,
 * `/leads`, `/seo`, `/ads`, `/social`) used a bare `overflow-x-auto` div
 * before this: technically already scrollable, but with zero visual
 * affordance that columns were cut off past the screen edge — on a phone
 * this reads as "the data is missing," not "swipe to see more."
 *
 * Not real content — `aria-hidden`, purely decorative, doesn't add
 * anything a screen reader needs to know about.
 */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="scrollbar-none overflow-x-auto">{children}</div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent sm:hidden"
      />
    </div>
  );
}

/**
 * The line along the top of the viewport that says a navigation was received.
 *
 * A `loading.tsx` cannot paint until the destination's own tree arrives, so on a
 * slow connection the old screen stays up for a full round trip after the click
 * and the click looks ignored. This is the one signal that can appear in the same
 * frame as the click, because it belongs to the page being left, not the one being
 * entered.
 *
 * Decorative: `aria-hidden` keeps it out of the accessibility tree, and the
 * destination's `LoadingAnnouncement` already announces the page politely.
 */
export function RouteProgress({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-accent-soft"
    >
      <div className="route-progress-bar h-full w-1/3 bg-accent motion-reduce:w-full" />
    </div>
  );
}

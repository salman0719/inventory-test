import { ContentSkeleton, LoadingAnnouncement } from "@/components/skeletons";

/**
 * Route-level loading UI. The shell paints immediately; this covers the page
 * segment while its business query resolves, so first paint is never a blank
 * screen or a layout that jumps.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <LoadingAnnouncement label="Loading page" />
      <ContentSkeleton />
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { noBusinessDestination } from "@/lib/admin";

/**
 * The app's "requires a business" gate has two destinations. A reviewer has no
 * business by design, so sending them to the wait screen — which offers to register
 * one — would leave the only person who can approve registrations unable to reach the
 * queue. Everyone else still waits.
 */
describe("noBusinessDestination", () => {
  it("sends a platform reviewer to the queue", () => {
    expect(noBusinessDestination(true)).toBe("/admin");
  });

  it("sends everyone else to the wait screen", () => {
    expect(noBusinessDestination(false)).toBe("/awaiting-approval");
  });
});

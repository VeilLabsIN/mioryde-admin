import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "./nav";
import { canAny } from "./permissions";

/**
 * The layer switch narrows what is offered. It must never widen it.
 *
 * The design brief described support agents as "assigned" to one side, which
 * reads like access control. It is not, and the gap between those two things is
 * exactly the kind of thing somebody eventually relies on. These tests pin the
 * distinction so a future change cannot quietly turn a preference into a
 * boundary — or, worse, a boundary into a preference.
 */
type Layer = "both" | "customer" | "rider";

function visible(role: Parameters<typeof canAny>[0], layer: Layer) {
  return NAV_GROUPS.flatMap((g) =>
    g.items.filter(
      (item) =>
        canAny(role, item.needs) &&
        (layer === "both" || item.side === undefined || item.side === layer),
    ),
  ).map((i) => i.href);
}

describe("layer switch", () => {
  it("never shows a role something it could not already reach", () => {
    for (const role of ["owner", "ops", "finance", "support"] as const) {
      const everything = new Set(visible(role, "both"));
      for (const layer of ["customer", "rider"] as const) {
        for (const href of visible(role, layer)) {
          expect(
            everything.has(href),
            `${role} sees ${href} under "${layer}" but not under "both"`,
          ).toBe(true);
        }
      }
    }
  });

  it("puts partner pages on the partner side and customers on the customer side", () => {
    const rider = visible("owner", "rider");
    const customer = visible("owner", "customer");

    expect(rider).toContain("/riders");
    expect(rider).toContain("/payouts");
    expect(rider).not.toContain("/customers");

    expect(customer).toContain("/customers");
    expect(customer).not.toContain("/riders");
    expect(customer).not.toContain("/payouts");
  });

  it("keeps the shared spine visible on both sides", () => {
    // Deliveries and the live board have a customer at one end and a partner at
    // the other. Hiding either from either side would mean the same rows were
    // unreachable depending on a preference.
    for (const layer of ["customer", "rider"] as const) {
      const hrefs = visible("owner", layer);
      expect(hrefs).toContain("/orders");
      expect(hrefs).toContain("/live");
      expect(hrefs).toContain("/map");
    }
  });

  it("still hides what the role cannot reach, whichever side is chosen", () => {
    for (const layer of ["both", "customer", "rider"] as const) {
      // Support holds neither payouts.view nor access.manage.
      expect(visible("support", layer)).not.toContain("/payouts");
      expect(visible("support", layer)).not.toContain("/access");
    }
  });
});

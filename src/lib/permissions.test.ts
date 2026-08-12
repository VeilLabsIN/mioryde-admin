import { describe, expect, it } from "vitest";
import {
  type AdminRole,
  type Capability,
  can,
  canOpen,
  landingPathFor,
} from "./permissions";

const ROLES: AdminRole[] = ["owner", "ops", "finance", "support"];

describe("admin permissions", () => {
  describe("least privilege", () => {
    it("keeps money away from operations and support", () => {
      for (const capability of ["payouts.view", "payouts.settle"] as const) {
        expect(can("ops", capability)).toBe(false);
        expect(can("support", capability)).toBe(false);
        expect(can("finance", capability)).toBe(true);
      }
    });

    it("keeps partner records away from finance and support", () => {
      // Rider records carry personal data. Finance settles payouts against a
      // payout id and never needs to open the person.
      for (const capability of ["riders.view", "riders.review"] as const) {
        expect(can("finance", capability)).toBe(false);
        expect(can("support", capability)).toBe(false);
        expect(can("ops", capability)).toBe(true);
      }
    });

    it("keeps the audit log to owner alone", () => {
      for (const role of ROLES) {
        expect(can(role, "audit.view")).toBe(role === "owner");
      }
    });

    it("lets only finance change pricing, while operations may read it", () => {
      expect(can("ops", "pricing.view")).toBe(true);
      expect(can("ops", "pricing.edit")).toBe(false);
      expect(can("finance", "pricing.edit")).toBe(true);
    });

    it("does not show revenue to support", () => {
      expect(can("support", "metrics.view")).toBe(false);
    });
  });

  describe("owner is a genuine superset", () => {
    it("holds every capability any other role holds", () => {
      // The server applies this in the guard rather than by enumeration. If the
      // mirror here drifts, an owner loses a control the API would have allowed
      // — invisible unless somebody signs in as owner and looks.
      const others = ROLES.filter((r) => r !== "owner");
      const all = new Set<Capability>();

      for (const role of others) {
        for (const capability of [
          "orders.view",
          "customers.view",
          "riders.view",
          "riders.review",
          "riders.history",
          "payouts.view",
          "payouts.settle",
          "pricing.view",
          "pricing.edit",
          "audit.view",
          "metrics.view",
        ] as const) {
          if (can(role, capability)) all.add(capability);
        }
      }

      for (const capability of all) {
        expect(can("owner", capability), `owner lacks ${capability}`).toBe(true);
      }
    });
  });

  describe("an absent role grants nothing", () => {
    it("denies every capability while the identity is still loading", () => {
      // The layout renders before `me()` resolves. Defaulting to permitted for
      // one frame would flash controls the operator may not have.
      expect(can(undefined, "payouts.settle")).toBe(false);
      expect(can(undefined, "orders.view")).toBe(false);
      expect(canOpen(undefined, "/payouts")).toBe(false);
    });
  });

  describe("route guarding", () => {
    it("matches nested paths, not just exact ones", () => {
      // /riders/<id> must be governed by the same capability as /riders,
      // otherwise a detail page is reachable when its list is not.
      expect(canOpen("ops", "/riders/abc-123")).toBe(true);
      expect(canOpen("finance", "/riders/abc-123")).toBe(false);
    });

    it("does not let the root prefix swallow every path", () => {
      // "/" is last in the table for this reason: every path starts with it,
      // so a naive prefix match would gate the whole panel on metrics.view.
      expect(canOpen("support", "/orders")).toBe(true);
      expect(canOpen("support", "/")).toBe(false);
    });

    it("allows unknown paths through to the router", () => {
      // A 404 is the router's business. Treating unmapped paths as forbidden
      // would redirect away from genuine not-found pages and hide the mistake.
      expect(canOpen("support", "/something-that-does-not-exist")).toBe(true);
    });
  });

  describe("landing page", () => {
    it("sends each role somewhere it can actually load", () => {
      for (const role of ROLES) {
        const landing = landingPathFor(role);
        expect(landing, `${role} has no landing page`).not.toBeNull();
        expect(canOpen(role, landing as string)).toBe(true);
      }
    });

    it("sends support to deliveries rather than the overview", () => {
      // The specific bug this prevents: support signs in, lands on a metrics
      // page their role cannot read, and concludes the account is broken.
      expect(landingPathFor("support")).toBe("/orders");
    });

    it("prefers the overview for roles that can read it", () => {
      expect(landingPathFor("ops")).toBe("/");
      expect(landingPathFor("finance")).toBe("/");
    });
  });
});

import type { AdminIdentity } from "./api";

export type AdminRole = AdminIdentity["role"];

/**
 * What each role may reach.
 *
 * A **mirror** of the server's matrix — see `roles.md` in the API beside
 * `admin.guard.ts`, which is the authority. This copy exists so the panel can
 * avoid showing an operator controls that will 403, which is a usability
 * concern rather than a security one.
 *
 * Worth being blunt about the direction of trust: nothing here protects
 * anything. Hiding a button hides a button. Every entry is independently
 * enforced by `@Roles(...)` on the route, and an operator who edits their own
 * stored role, or types a URL directly, reaches a page that then fails to load
 * any data. That is the design, not a gap in it.
 *
 * The risk with a mirror is drift: loosen it here and the panel offers actions
 * that fail; tighten it and features silently disappear. Neither is dangerous,
 * both are confusing, so `handleForbidden` below turns the first case into an
 * explanation rather than a generic error.
 */
export type Capability =
  | "orders.view"
  | "customers.view"
  | "riders.view"
  | "riders.review"
  | "riders.history"
  | "payouts.view"
  | "payouts.settle"
  | "pricing.view"
  | "pricing.edit"
  | "audit.view"
  | "metrics.view";

const MATRIX: Record<AdminRole, readonly Capability[]> = {
  // Superset, applied in the guard rather than by listing every capability —
  // an owner acquiring a capability only when someone remembers to add it here
  // is exactly the drift this comment warns about.
  owner: [
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
  ],
  ops: [
    "orders.view",
    "customers.view",
    "riders.view",
    "riders.review",
    "riders.history",
    "pricing.view",
    "metrics.view",
  ],
  finance: ["payouts.view", "payouts.settle", "pricing.view", "pricing.edit", "metrics.view"],
  support: ["orders.view", "customers.view"],
};

export function can(
  role: AdminRole | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(capability) ?? false;
}

/** True when the role can reach at least one of these. Drives nav visibility. */
export function canAny(
  role: AdminRole | undefined,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some((c) => can(role, c));
}

/**
 * What each route needs, longest-prefix first.
 *
 * Shared with the sidebar so navigation and the route guard cannot disagree —
 * a link that is visible but redirects away, or hidden but reachable, are both
 * the kind of bug that only shows up for one role and therefore only in
 * production.
 */
const ROUTE_CAPABILITIES: ReadonlyArray<readonly [string, Capability]> = [
  ["/orders", "orders.view"],
  // Same right as reading deliveries, but listed *after* /orders on purpose:
  // this list decides where a role lands after signing in, and the live board
  // starts empty. Support arriving at "Waiting for activity" instead of their
  // work queue is a worse first screen than the one they came for.
  ["/live", "orders.view"],
  ["/customers", "customers.view"],
  ["/riders", "riders.view"],
  // Verification is the same job as reviewing a partner, so it rides on the
  // same capability rather than inventing a role nobody has been granted.
  ["/kyc", "riders.review"],
  // Deciding where money is sent belongs with the people who settle it.
  ["/banking", "payouts.settle"],
  // Clearing what a partner owes the business is a settlement decision.
  ["/collections", "payouts.settle"],
  ["/payouts", "payouts.view"],
  ["/pricing", "pricing.view"],
  ["/audit", "audit.view"],
  // Last, because every path starts with "/".
  ["/", "metrics.view"],
];

/** Whether a role may open a path at all. Unknown paths are allowed — a 404 is
 *  the router's business, not a permissions decision. */
export function canOpen(role: AdminRole | undefined, pathname: string): boolean {
  const match = ROUTE_CAPABILITIES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? can(role, match[1]) : true;
}

/**
 * Where to send a role that has landed somewhere it cannot be.
 *
 * Support staff have no metrics access, so the default landing page — the
 * overview — is a page they can never load. Without this they sign in to a
 * permanent error and reasonably conclude their account is broken.
 *
 * Returns null when the role can reach nothing at all, which is a real state:
 * an account whose role was narrowed after it was created. The caller signs
 * them out rather than looping.
 */
export function landingPathFor(role: AdminRole | undefined): string | null {
  const match = ROUTE_CAPABILITIES.filter(([, capability]) =>
    can(role, capability),
  );
  // Prefer the overview when available; otherwise the first thing they can use.
  const home = match.find(([prefix]) => prefix === "/");
  return (home ?? match[0])?.[0] ?? null;
}

/** Human-readable role, for the header and for permission messages. */
export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  ops: "Operations",
  finance: "Finance",
  support: "Support",
};

/**
 * Message for a 403, phrased as a permissions fact rather than a failure.
 *
 * An operator who sees "Request failed (403)" reasonably concludes the system
 * is broken and raises a ticket. Naming their role and what it lacks turns the
 * same event into information — and, when the mirror above has drifted looser
 * than the server, makes that drift visible rather than mysterious.
 */
export function forbiddenMessage(role: AdminRole | undefined): string {
  const label = role ? ROLE_LABEL[role] : "Your account";
  return `${label} does not have access to this. Ask an owner if you need it.`;
}

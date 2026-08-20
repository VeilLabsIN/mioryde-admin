"use client";

import { createContext, useContext } from "react";
import type { AdminIdentity } from "@/lib/api";
import { type Capability, can } from "@/lib/permissions";

/**
 * Who is signed in, readable from any page.
 *
 * The shell has always known this — it fetches the identity to decide whether
 * to render at all — but kept it to itself, so a page that wanted to show one
 * thing to an owner and another to support had no way to ask. Every page that
 * needed it either did without or would have had to re-fetch the session.
 *
 * That gap is why the company's PAN was on `/legal` in plain sight of every
 * support account: the page had no way to gate anything, so it gated nothing.
 *
 * Same direction of trust as the rest of the panel — this hides things, it does
 * not protect them. Anything that must not reach a role has to be withheld by
 * the API, and the confidential-identifier case is handled by not shipping the
 * value to the browser at all rather than by hiding it here.
 */
const AdminContext = createContext<AdminIdentity | null>(null);

export function AdminProvider({
  admin,
  children,
}: {
  admin: AdminIdentity;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

/** The signed-in admin. Null only outside the panel shell. */
export function useAdmin(): AdminIdentity | null {
  return useContext(AdminContext);
}

/** Whether the signed-in admin holds a capability. */
export function useCan(capability: Capability): boolean {
  return can(useAdmin()?.role, capability);
}

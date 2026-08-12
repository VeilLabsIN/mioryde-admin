"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Spinner } from "@/components/ui";
import { type AdminIdentity, api, auth } from "@/lib/api";
import { canOpen, landingPathFor } from "@/lib/permissions";

/**
 * Shell for every authenticated page.
 *
 * The guard is client-side because this panel is a static export talking to a
 * separate API — there is no server session to check during rendering. That is
 * fine: it protects the *view*, while the API independently rejects every
 * request without a valid admin token. Bypassing this guard gets you an empty
 * page that can load nothing.
 */
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!auth.isSignedIn()) {
      router.replace("/login");
      return;
    }

    // Verified against the server rather than trusted from storage: a token can
    // be revoked, expired, or belong to a deactivated account.
    api
      .me()
      .then((identity) => {
        if (cancelled) return;
        setAdmin(identity);
        setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        auth.clear();
        router.replace("/login");
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Sends a role away from a page it can never load. Support has no metrics
  // access, so the overview — the default landing page — would otherwise be a
  // permanent error they sign in to, and reasonably read as a broken account.
  //
  // Not a security boundary. The API refuses the underlying requests
  // regardless; this only stops the panel from presenting a dead end.
  useEffect(() => {
    if (!admin || canOpen(admin.role, pathname)) return;

    const landing = landingPathFor(admin.role);
    if (landing === null) {
      // A role that can reach nothing at all — narrowed after the account was
      // created. Redirecting anywhere would loop, so end the session instead.
      auth.clear();
      router.replace("/login");
      return;
    }
    router.replace(landing);
  }, [admin, pathname, router]);

  if (!checked || !admin) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-5 text-fg-faint" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={admin.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
          <div aria-hidden className="hazard h-1 w-16 opacity-50" />

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[13px] font-medium leading-tight">{admin.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted">
                {admin.role}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await api.logout();
                router.replace("/login");
              }}
              className="border border-edge px-3 py-1.5 font-mono text-[10px] uppercase
                         tracking-[1.5px] text-fg-muted transition-colors duration-150
                         hover:border-danger hover:text-danger"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

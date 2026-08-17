"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/ToastProvider";
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

    // The access token lives in memory, so a page load starts with nothing.
    // restoreSession trades the HttpOnly refresh cookie for a new one and then
    // verifies the identity against the server — a token can be revoked,
    // expired, or belong to a deactivated account, so nothing here is trusted
    // from the client side.
    api
      .restoreSession()
      .then((identity) => {
        if (cancelled) return;
        if (!identity) {
          router.replace("/login");
          return;
        }
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
    // ToastProvider wraps the whole shell rather than sitting inside <main>, so
    // a result that lands after the operator has navigated elsewhere still
    // reaches them. Previously each page owned its own success and error
    // rendering, and anything that resolved after unmount was lost.
    <ToastProvider>
    <div className="flex min-h-dvh">
      {/* Straight past fifteen nav items to the content. The first thing a
          keyboard or screen-reader user meets on every single page was the
          whole sidebar. */}
      <a
        href="#panel-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3
                   focus:z-50 focus:border focus:border-accent focus:bg-raised
                   focus:px-3 focus:py-2 focus:text-body"
      >
        Skip to content
      </a>

      <Sidebar role={admin.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
          <div aria-hidden className="hazard h-1 w-16 opacity-50" />

          <div className="flex items-center gap-4">
            {/* Your own name is where people look for their own account
                settings, which is the only thing on the other end of this —
                changing your password. It is deliberately not in the nav: it
                belongs to every role, and the nav is organised by capability. */}
            <Link
              href="/security"
              aria-label="Your account and password"
              className="group text-right transition-colors duration-150"
            >
              <p className="text-[13px] font-medium leading-tight group-hover:text-accent">
                {admin.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted">
                {admin.role}
              </p>
            </Link>
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

        <main id="panel-main" className="min-w-0 flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}

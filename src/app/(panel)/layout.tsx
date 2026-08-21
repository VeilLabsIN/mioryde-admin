"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminProvider } from "@/components/AdminProvider";
import { AttentionProvider, BannerStrip } from "@/components/Banner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PanelFooter } from "@/components/PanelFooter";
import { TopBar } from "@/components/TopBar";
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
  const [navOpen, setNavOpen] = useState(false);

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
    {/* Who is signed in, readable from any page rather than only here. Pages
        that need to show one thing to an owner and another to support had no
        way to ask, which is how the company's PAN ended up on a page every
        support account could open. */}
    <AdminProvider admin={admin}>
    {/* One health check for the whole shell. The banner strip and the footer's
        status light are the same question asked twice, and two polls of two
        role-gated endpoints could disagree with each other on screen. */}
    <AttentionProvider>
    {/* A column, not a row: the bar spans the full width above everything,
        and the rail and content share the space beneath it. That is what
        makes the product mark and the search box fixed furniture rather
        than something the sidebar owns and can collapse away. */}
    <div className="flex h-dvh flex-col">
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

      {/* The drawer's open state lives here rather than in the rail because
          the control that opens it is in the top bar, and two siblings cannot
          share state without a parent holding it. */}
      <TopBar admin={admin} onOpenNav={() => setNavOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          role={admin.role}
          open={navOpen}
          onOpen={() => setNavOpen(true)}
          onClose={() => setNavOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Above the scroll container, so a critical banner does not scroll
              away from an operator who is halfway down a long queue. */}
          <BannerStrip />

          <Breadcrumbs />

          {/* Tighter below `sm`: 24px of padding on each side of a 375px
              screen spends an eighth of the width on nothing. */}
          <main
            id="panel-main"
            className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"
          >
            {children}
          </main>

          {/* Outside <main>, so it does not scroll away from an operator two
              thousand rows down a delivery table — which is exactly when
              "is the system healthy" and "who do I tell" get asked. */}
          <PanelFooter role={admin.role} />
        </div>
      </div>
    </div>
    </AttentionProvider>
    </AdminProvider>
    </ToastProvider>
  );
}

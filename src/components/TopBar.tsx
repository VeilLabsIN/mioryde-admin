"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandSearch } from "./CommandSearch";
import { HelpDrawer } from "./HelpDrawer";
import { type AdminIdentity, api, auth } from "@/lib/api";

/**
 * The bar across the top of every page.
 *
 * Previously the identity block sat in a header *beside* the sidebar, and the
 * product mark sat inside the sidebar — so collapsing the rail took the
 * product's name off the screen, and the two halves of "who am I, what is
 * this" were in different columns.
 *
 * Spanning the full width instead puts the fixed furniture in one place and
 * leaves the row below it entirely to navigation and content. It also gives
 * search somewhere to live that is the same on every page, which is the point
 * of a command palette — a control that moves is a control you look for.
 */
export function TopBar({ admin }: { admin: AdminIdentity }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  // `?` is the shortcut people try first, but it is also a character — so it
  // only counts when nothing is being typed into.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-4 border-b border-line
                 bg-surface px-4"
    >
      <Link
        href="/"
        className="motion-change flex shrink-0 items-center gap-2.5
                   transition-opacity hover:opacity-80"
        aria-label="Mioryde Operations — go to overview"
      >
        <span
          aria-hidden
          className="chamfer-sm grid size-8 place-items-center bg-accent"
        >
          <span className="font-mono text-body font-bold text-on-accent">M</span>
        </span>
        <span className="hidden sm:block">
          <span className="block font-sans text-body font-semibold leading-tight">
            Mioryde
          </span>
          <span className="block font-mono text-micro uppercase text-fg-muted">
            Operations
          </span>
        </span>
      </Link>

      {/* Centred and elastic: the palette is the one control an operator
          reaches for without looking, so it holds the same spot at every
          width rather than sliding as the identity block changes length. */}
      <div className="flex min-w-0 flex-1 justify-center">
        <CommandSearch role={admin.role} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Help and the legal pages belong to every role and to no section of
            the nav, which is organised by capability. They live here, one
            click from anywhere, rather than as a fifteenth sidebar item. */}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Help — what is this page for"
          title="Help (?)"
          className="motion-change grid size-8 place-items-center rounded-full
                     border border-edge text-body text-fg-muted transition-colors
                     hover:border-accent hover:text-accent"
        >
          ?
        </button>

        {/* Your own name is where people look for their own account settings,
            which is the only thing on the other end of this — changing your
            password. Deliberately not in the nav: it belongs to every role,
            and the nav is organised by capability. */}
        <Link
          href="/security"
          aria-label="Your account and password"
          className="group hidden text-right transition-colors duration-150 sm:block"
        >
          <span className="block text-body font-medium leading-tight group-hover:text-accent">
            {admin.name}
          </span>
          <span className="block font-mono text-micro uppercase text-fg-muted">
            {admin.role}
          </span>
        </Link>

        <button
          type="button"
          onClick={async () => {
            await api.logout();
            auth.clear();
            router.replace("/login");
          }}
          className="motion-change border border-edge px-3 py-1.5 font-mono
                     text-micro uppercase text-fg-muted transition-colors
                     duration-150 hover:border-danger hover:text-danger"
        >
          Sign out
        </button>
      </div>

      {helpOpen && <HelpDrawer onClose={() => setHelpOpen(false)} />}
    </header>
  );
}

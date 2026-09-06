"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandSearch } from "./CommandSearch";
import { HelpDrawer } from "./HelpDrawer";
import { Avatar, BrandMark } from "./BrandMark";
import { type AdminIdentity, api, auth } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";
import { useFullscreen } from "@/lib/useFullscreen";
import { playAlert, setSoundEnabled, soundEnabled } from "@/lib/alertSound";

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
export function TopBar({
  admin,
  onOpenNav,
}: {
  admin: AdminIdentity;
  /** Opens the navigation drawer. Only reachable below `md`, where the rail
   *  is an overlay rather than a column. */
  onOpenNav?: () => void;
}) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const {
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen();

  // Read in an effect, not at render: `localStorage` does not exist on the
  // server, and a value that differs between the server HTML and the first
  // client render is a hydration mismatch.
  const [sound, setSound] = useState(false);
  useEffect(() => setSound(soundEnabled()), []);

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
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="motion-change -ml-1 grid size-9 shrink-0 place-items-center text-fg-muted
                   transition-colors hover:text-fg md:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M2 4.5h14M2 9h14M2 13.5h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      </button>

      <Link
        href="/"
        className="motion-change flex shrink-0 items-center gap-2.5
                   transition-opacity hover:opacity-80"
        aria-label="Mioryde Operations — go to overview"
      >
        <span
          aria-hidden
          className="chamfer-sm grid size-8 place-items-center bg-accent-bright"
        >
          {/* Drawn, not a letter and not a file — see BrandMark. `currentColor`
              is what lets one component sit on this amber tile and anywhere
              else the theme puts it. */}
          <BrandMark className="text-on-accent-bright" size={18} />
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
        {/*
          The escape hatch, and the way in for anyone who did not tick the box.

          Rendered only where the browser allows fullscreen, because a control
          that silently does nothing is worse than no control. Hidden on small
          screens: on a phone the browser chrome is most of the affordance for
          getting back, and there is no dispatch display to fill.

          `aria-pressed` rather than two labels, so a screen reader announces
          one control with a state instead of what sounds like two buttons that
          come and go.
        */}
        {/*
          Sound.

          Visible **whenever it is on**, which the stage asks for and which is
          the honest requirement for an app that makes noise: something that can
          startle a room needs its off switch in the room, not three clicks down
          in Settings. When it is off the control is a small muted speaker
          rather than nothing at all — an audio feature nobody can find is an
          audio feature nobody uses, and hiding the way *in* while showing only
          the way out would be the reverse of the usual mistake but still a
          mistake.

          `aria-pressed` gives one control with a state rather than what sounds
          to a screen reader like two buttons swapping places.
        */}
        <button
          type="button"
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
            // A short confirmation, played only when switching on, and forced
            // past the enabled check because the preference has only just been
            // written. Turning sound *on* and hearing nothing leaves somebody
            // unsure whether it worked — and the click is the user gesture the
            // AudioContext needs to start, so this is also the moment that
            // makes every later alert audible.
            if (next) playAlert("placed", { force: true });
          }}
          aria-pressed={sound}
          aria-label={sound ? "Mute alerts" : "Play a sound for new alerts"}
          title={
            sound
              ? "Alerts make a sound. Click to mute."
              : "Alerts are silent. Click to enable sound."
          }
          className={`motion-change hidden size-8 place-items-center border
                      transition-colors duration-150 sm:grid ${
                        sound
                          ? "border-accent text-accent"
                          : "border-edge text-fg-muted hover:border-accent hover:text-accent"
                      }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M3 5.2h2L7.6 3v8L5 8.8H3z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            {sound ? (
              // Two arcs: on.
              <path
                d="M9.6 5.1a2.7 2.7 0 0 1 0 3.8M11.2 3.6a5 5 0 0 1 0 6.8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            ) : (
              // A cross: muted. Drawn rather than left as a bare speaker,
              // because a speaker with no arcs reads as "quiet", not "off".
              <path
                d="M9.8 5.4l3 3.2M12.8 5.4l-3 3.2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        {fullscreenSupported && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? "Leave fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Leave fullscreen (Esc)" : "Enter fullscreen"}
            className="motion-change hidden size-8 place-items-center border border-edge
                       text-fg-muted transition-colors duration-150
                       hover:border-accent hover:text-accent sm:grid"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
            >
              {/*
                Four corner brackets, pointing out to enter and in to leave.
                The arrow direction is the whole message, so it is drawn rather
                than relying on a label nobody reads on a toolbar icon.
              */}
              <path
                d={
                  isFullscreen
                    ? "M5.5 1.5v4h-4M8.5 1.5v4h4M5.5 12.5v-4h-4M8.5 12.5v-4h4"
                    : "M1.5 5V1.5H5M9 1.5h3.5V5M1.5 9v3.5H5M9 12.5h3.5V9"
                }
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        {/* Your own name is where people look for their own account settings,
            which is the only thing on the other end of this — changing your
            password. Deliberately not in the nav: it belongs to every role,
            and the nav is organised by capability. */}
        <Link
          href="/security"
          aria-label="Your account and password"
          className="group flex items-center gap-2.5 transition-colors duration-150"
        >
          {/* Replaces the "?" that used to sit here. Help did not belong beside
              somebody's name — it is not part of their account — and it is
              still one keystroke away on `?` and linked from the footer. What
              belongs here is the answer to "who am I signed in as", which on a
              panel where roles decide what is visible is worth a glance rather
              than a read. */}
          <Avatar name={admin.name} id={admin.id} />
          <span className="hidden text-right sm:block">
          <span className="block text-body font-medium leading-tight group-hover:text-accent">
            {admin.name}
          </span>
          <span className="block font-mono text-micro uppercase text-fg-muted">
            {/* The label, not the raw role. `owner` and `ops` read fine
                uppercased; `dev_admin` does not, and the underscore is the
                database's business rather than the operator's. */}
            {ROLE_LABEL[admin.role]}
          </span>
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

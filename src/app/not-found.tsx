import Link from "next/link";

/**
 * A mistyped URL, or a link to a page that no longer exists.
 *
 * Next's default 404 renders with none of the panel's chrome, so an operator
 * who fat-fingered a URL lost their navigation entirely and the only way back
 * was the browser button.
 *
 * This one cannot show the sidebar — a root-level `not-found` renders outside
 * the `(panel)` layout, and the layout is where the session check lives, so
 * putting the rail here would mean rendering navigation for a possibly
 * unauthenticated visitor. A plain page with one link out is the honest version.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-[420px] text-center">
        <p className="font-mono text-micro uppercase text-fg-muted">
          404 · Not found
        </p>

        <h1 className="mt-2 font-sans text-title">This page does not exist</h1>

        <p className="mt-2 text-body text-fg-muted">
          The address may be mistyped, or it may be a link to something that has
          since been removed.
        </p>

        <Link
          href="/"
          className="motion-change mt-6 inline-block border border-edge px-4 py-2 text-body
                     text-fg-mid transition-colors hover:border-accent hover:text-accent"
        >
          Back to the panel
        </Link>
      </div>
    </main>
  );
}

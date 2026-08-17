"use client";

import { useEffect } from "react";
import { Button, Card, GhostButton, SectionLabel } from "@/components/ui";

/**
 * What the operator sees when a page throws.
 *
 * There was no error boundary at all before this, which means an unhandled
 * render error produced a blank region inside the panel chrome — the exact
 * symptom of BUG-038, the CSP bug that built, typechecked and passed all 38
 * tests while rendering nothing. That took a browser to find, and a boundary
 * would have made it say so.
 *
 * Scoped to the `(panel)` segment on purpose, so the sidebar and header survive
 * and the operator can navigate away rather than being stranded on a dead page
 * with only the back button.
 *
 * It states plainly that the panel failed. A friendly "something went wrong"
 * with no detail invites the operator to assume they did something wrong and to
 * retry the same action, which is rarely the useful response.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console rather than a Sentry call: the DSN is a documented blocker, so
    // there is nowhere to send this yet. When Sentry is configured this is the
    // one line that changes.
    console.error("Panel render error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[620px] py-10">
      <Card tone="critical" className="p-5">
        <SectionLabel>This page failed to render</SectionLabel>

        <p className="text-body text-fg-soft">
          The panel hit an error it could not recover from. Nothing you did
          caused it, and no data was changed by the failure.
        </p>

        <p className="mt-3 break-words font-mono text-meta text-warn">
          {error.message || "No message was attached to the error."}
        </p>

        {error.digest && (
          // The digest is what ties this to a server log line, so it is worth
          // showing even though it means nothing to the reader.
          <p className="mt-1 font-mono text-micro uppercase text-fg-faint">
            Reference {error.digest}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <GhostButton onClick={() => location.assign("/")}>
            Back to overview
          </GhostButton>
        </div>

        <p className="mt-4 text-meta text-fg-faint">
          If it happens twice, the message above is the useful part of a bug
          report.
        </p>
      </Card>
    </div>
  );
}

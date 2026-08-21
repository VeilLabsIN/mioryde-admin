"use client";

import { useState } from "react";
import { GhostButton, Spinner } from "./ui";
import { useToast } from "./ToastProvider";
import { ApiError } from "@/lib/api";

/**
 * "Give me this as a spreadsheet."
 *
 * The analytics page invented this first — fetch with the bearer token, wrap
 * the bytes in an object URL, click a synthetic link, revoke immediately —
 * and every one of those steps has a reason. Copying them into four more pages
 * by hand is four chances to forget the revoke and leak a copy of every export
 * an operator takes during a shift.
 *
 * The failure is a toast rather than an inline message on purpose: an export
 * is an action with an outcome, not a property of anything on the page, and
 * the page underneath it is unchanged either way.
 */
export function ExportButton({
  fetcher,
  label = "Export CSV",
  disabled,
  className = "",
}: {
  /** Returns the file. Any of the `api.download*Csv` calls fits. */
  fetcher: () => Promise<{ blob: Blob; filename: string }>;
  label?: string;
  /** Non-null disables the button and explains why in its tooltip. */
  disabled?: string | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function run() {
    setBusy(true);
    try {
      const { blob, filename } = await fetcher();

      // The blob stays in memory until the URL is revoked, so it is revoked in
      // the same turn rather than left to the tab's lifetime.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      // Named, because the file lands in a downloads folder with no further
      // announcement and the name carries the period and any filter.
      toast.success(`Downloaded ${filename}`);
    } catch (caught: unknown) {
      toast.error(
        caught instanceof ApiError
          ? caught.message
          : "Could not export. Nothing was downloaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <GhostButton
      onClick={run}
      disabled={busy || Boolean(disabled)}
      title={disabled ?? undefined}
      className={`inline-flex items-center gap-2 ${className}`}
    >
      {busy && <Spinner className="size-3" />}
      {busy ? "Preparing…" : label}
    </GhostButton>
  );
}

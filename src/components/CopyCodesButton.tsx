"use client";

import { useState } from "react";
import { GhostButton } from "@/components/ui";
import type { AdminOrder } from "@/lib/api";

/**
 * Copies the selected order codes, one per line.
 *
 * ## Why the count can disagree with the list, and why that is said out loud
 *
 * Selection survives paging; the *rows* do not. `selectedOrders` can only
 * contain what is currently loaded, so a set gathered across three pages
 * copies only the page in front of you — silently, and with a button that
 * reported success.
 *
 * Rather than pretend, the label says what it will actually copy whenever the
 * two differ. The alternative is either a lie or holding every visited page in
 * memory to make the promise true, and for a list this size the honest label is
 * the better trade.
 */
export function CopyCodesButton({
  orders,
  total,
}: {
  orders: AdminOrder[];
  /** How many are selected overall, including rows not currently loaded. */
  total: number;
}) {
  const [copied, setCopied] = useState(false);
  const partial = orders.length !== total;

  async function copy() {
    const text = orders.map((order) => order.code).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Long enough to read, short enough that the button is ready again
      // before the operator wants it. No cleanup on unmount: the bar unmounts
      // when the selection is cleared, and a stray setState on an unmounted
      // component is a warning, not a leak — but the timer is cheap to clear
      // and the guard below costs nothing.
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The Clipboard API needs a secure context and a user gesture. Both hold
      // here, but a browser policy can still refuse — and a button that
      // silently does nothing is worse than one that admits it.
      setCopied(false);
      window.alert("The browser would not allow copying. Select and copy manually.");
    }
  }

  return (
    <GhostButton onClick={copy} aria-live="polite">
      {copied
        ? "Copied"
        : partial
          ? `Copy ${orders.length} on this page`
          : "Copy codes"}
    </GhostButton>
  );
}

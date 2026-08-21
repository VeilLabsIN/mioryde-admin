/**
 * Turning what an operator typed into the integer the API expects.
 *
 * Every amount on the wire is integer minor units — paise for money, basis
 * points for a tax rate — and the panel has never had to go in this direction
 * before: it reads `{minor}` and formats it, and that is all. A form is the
 * first place a *person* supplies an amount, so this is the first place a
 * rupee string has to become an integer.
 *
 * **Not `Math.round(Number(x) * 100)`.** That is the exact shape of the bug
 * that rendered a ₹42 day as ₹0.42, and in this direction it fails more
 * quietly: `Number("1.15") * 100` is `114.99999999999999`, and rounding hides
 * it until the day it does not. The digits are split as text and reassembled
 * as an integer, so nothing is ever a float.
 *
 * Rejections carry a message rather than a boolean because they are shown
 * beside the field. "Use at most 2 decimal places" tells the operator what to
 * do; "invalid" tells them to guess.
 */
export type ParseResult =
  | { ok: true; minor: number }
  | { ok: false; error: string };

/**
 * Parses a decimal the operator typed into an integer scaled by `decimals`.
 *
 * `₹`, spaces and Indian digit grouping are stripped rather than refused —
 * they are what appears when somebody copies a figure out of the table above
 * the form, and rejecting a paste of the panel's own output would be absurd.
 */
export function parseScaled(input: string, decimals: number): ParseResult {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter an amount." };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) {
    return { ok: false, error: "Numbers only." };
  }

  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    return {
      ok: false,
      error:
        decimals === 0
          ? "Whole numbers only."
          : `Use at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
    };
  }

  // Padded, not multiplied: "1.5" is 150 paise because the digits say so.
  const padded = fraction.padEnd(decimals, "0");
  const minor = Number(`${whole || "0"}${padded}`);
  if (!Number.isSafeInteger(minor)) {
    return { ok: false, error: "That is too large." };
  }
  return { ok: true, minor };
}

/** Rupees as typed → paise. */
export function rupeesToMinor(input: string): ParseResult {
  return parseScaled(input, 2);
}

/** A GST percentage as typed → basis points, which is what the API takes. */
export function percentToBasisPoints(input: string): ParseResult {
  return parseScaled(input, 2);
}

/**
 * Paise → the string to put in the field.
 *
 * Always two decimals. A field that shows "35" and one that shows "35.00" are
 * the same number, but a column of fares where some have decimals and some do
 * not is the thing the pricing table's tabular figures exist to avoid — and
 * an editor that reformats what you typed the moment you leave the field is
 * worse than one that starts consistent.
 */
export function minorToRupeeInput(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

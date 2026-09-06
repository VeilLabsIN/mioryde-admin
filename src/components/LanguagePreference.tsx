"use client";

import { useEffect, useState } from "react";

/**
 * The panel's language preference.
 *
 * ## What this honestly does, and what it does not
 *
 * The two apps are translated: their copy lives in `.arb` files and switching
 * language re-renders every string. **The panel is not**, and this control does
 * not pretend otherwise.
 *
 * What it does change is real and panel-wide: the locale used to format dates,
 * times and numbers. Picking Hindi renders timestamps and figures in Devanagari
 * numerals and Hindi month names everywhere they appear. That is the part of an
 * operations console a Hindi reader actually has to parse at speed — a column
 * of figures is read far more often than a section heading.
 *
 * The card says the English wording is unchanged, in as many words. A toggle
 * that quietly did nothing would be worse than no toggle: the operator would
 * conclude the panel was broken rather than that the feature was unfinished.
 *
 * ## Why this is smaller than the apps' version
 *
 * Nikhil's own scoping: "for Admin, add it to Settings only, it's not required
 * much in admin panel". Staff are trained on this console and read it daily;
 * a partner meeting the rider app for the first time is in a different
 * position, which is why that app puts the switch on its very first screen.
 */
export type PanelLocale = "en-IN" | "hi-IN";

const KEY = "mioryde-panel-locale";

/** Read once, synchronously, so the first render is not the wrong locale. */
export function readPanelLocale(): PanelLocale {
  if (typeof window === "undefined") return "en-IN";
  try {
    return window.localStorage.getItem(KEY) === "hi-IN" ? "hi-IN" : "en-IN";
  } catch {
    // Storage can throw outright in a locked-down browser profile. English is
    // the safe answer and the panel still works.
    return "en-IN";
  }
}

export function LanguagePreference() {
  // Starts on English and corrects after mount rather than reading storage
  // during render: the server render has no localStorage, and a mismatch
  // between it and the first client render is a hydration error.
  const [locale, setLocale] = useState<PanelLocale>("en-IN");

  useEffect(() => setLocale(readPanelLocale()), []);

  function choose(next: PanelLocale) {
    setLocale(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this session.
    }
    // A full reload rather than a context broadcast. Formatting happens in
    // dozens of leaf components and a few module-level helpers that hold no
    // React state; re-reading them all correctly is more machinery than a
    // setting nobody changes twice deserves.
    window.location.reload();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["en-IN", "English", "English"],
            ["hi-IN", "हिंदी", "Hindi"],
          ] as const
        ).map(([value, native, english]) => (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={locale === value}
            className={`motion-change rounded-sm border px-3 py-1.5 text-body transition-colors ${
              locale === value
                ? "border-accent text-accent"
                : "border-edge text-fg-muted hover:border-edge-strong hover:text-fg"
            }`}
          >
            {/* The native name first, as in both apps: somebody looking for
                their own language recognises the script before the word. */}
            {native}
            {native !== english && (
              <span className="text-fg-faint ml-1.5 text-micro">{english}</span>
            )}
          </button>
        ))}
      </div>

      <p className="text-fg-muted text-meta mt-3 leading-relaxed">
        This sets how dates, times and amounts are written — Hindi gives
        Devanagari numerals and Hindi month names throughout the panel.{" "}
        <strong className="text-fg">
          The panel&rsquo;s own wording stays in English.
        </strong>{" "}
        The customer and partner apps are fully translated; this console is not
        yet, and saying so here is better than a switch that appears to do
        nothing.
      </p>
    </div>
  );
}

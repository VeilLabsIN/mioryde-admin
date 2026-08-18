"use client";

import { useTheme } from "./ThemeProvider";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; glyph: React.ReactNode }[] = [
  {
    value: "midnight",
    label: "Midnight",
    glyph: <circle cx="7" cy="7" r="4" fill="currentColor" />,
  },
  {
    value: "daylight",
    label: "Daylight",
    glyph: (
      <>
        <circle cx="7" cy="7" r="3" fill="currentColor" />
        <path
          d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M11.2 2.8l-1 1M3.8 10.2l-1 1"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    value: "system",
    label: "System",
    glyph: (
      <>
        <rect
          x="1.5"
          y="2.5"
          width="11"
          height="8"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M5 12.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
];

/**
 * Segmented theme control.
 *
 * The selection marker is one element that slides, for the same reason as the
 * sidebar indicator: a single composited transform beats three elements
 * cross-fading their backgrounds.
 */
export function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme, usingSystemAccent } = useTheme();
  const index = OPTIONS.findIndex((o) => o.value === theme);

  if (collapsed) {
    // Collapsed: cycle through instead of showing a segmented control that
    // cannot fit. Same affordance, no layout gymnastics.
    return (
      <button
        type="button"
        onClick={() => setTheme(OPTIONS[(index + 1) % OPTIONS.length]!.value)}
        title={`Theme: ${OPTIONS[index]?.label ?? "Midnight"}`}
        aria-label={`Theme: ${OPTIONS[index]?.label ?? "Midnight"}. Click to change.`}
        className="flex h-9 w-full items-center px-3 text-fg-faint transition-colors
                   duration-150 hover:text-accent"
      >
        <span className="grid size-7 shrink-0 place-items-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            {OPTIONS[index]?.glyph}
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div className="px-1 py-1">
      <p className="px-2 pb-1.5 font-mono text-micro uppercase text-fg-faint">
        Theme
      </p>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="relative grid grid-cols-3 gap-0 border border-line bg-panel p-0.5"
      >
        {/* Sliding selection marker. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 chamfer-sm bg-raised
                     ring-1 ring-edge transition-transform duration-250
                     ease-[var(--ease-out-quint)] motion-reduce:transition-none"
          style={{
            width: "calc((100% - 4px) / 3)",
            transform: `translate3d(${index * 100}%, 0, 0)`,
          }}
        />

        {OPTIONS.map((option) => {
          const selected = option.value === theme;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(option.value)}
              title={option.label}
              className={`relative z-10 flex h-8 items-center justify-center transition-colors
                          duration-150 ${
                            selected
                              ? "text-accent"
                              : "text-fg-faint hover:text-fg-mid"
                          }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                {option.glyph}
              </svg>
              <span className="sr-only">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/*
        Honest about what "System" actually did. The OS accent is only readable
        in Firefox and Safari — in Chromium the theme still follows OS
        light/dark, but the accent stays Mioryde amber. Saying so beats a user
        wondering why their blue Windows accent did nothing.
      */}
      {theme === "system" && (
        <p className="animate-slide-in px-2 pt-1.5 text-meta text-fg-faint">
          {usingSystemAccent
            ? "Using your system accent colour."
            : "Following system light/dark. This browser doesn't expose the OS accent colour."}
        </p>
      )}
    </div>
  );
}

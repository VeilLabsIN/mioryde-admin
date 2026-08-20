"use client";

import { useEffect, useState } from "react";

/**
 * Which half of the business you are working on.
 *
 * `both` is the default and is not a compromise — it is what most of the panel
 * genuinely is. Deliveries, the live board and the map involve a customer and
 * a partner in the same row, and pretending otherwise would mean showing the
 * same page twice under two headings.
 */
export type Layer = "both" | "customer" | "rider";

const KEY = "mioryde-layer";

/**
 * The layer, remembered per browser.
 *
 * Not in the URL, for the same reason the list layout is not: a link somebody
 * shares should reproduce the *rows being discussed*, not the lens the sender
 * happened to have on.
 *
 * And not a permission. What an operator may reach is decided by their role and
 * enforced by the API; this only decides what the sidebar bothers to offer, so
 * a support agent switching to "Partner side" still sees exactly the pages
 * their role allows and nothing more.
 *
 * That distinction is worth being firm about. The design brief described
 * support agents as "assigned" to one side, which sounds like access control
 * and is not — there is no per-agent side in the database, and a navigation
 * filter that merely *looked* like a boundary would be worse than no filter at
 * all, because somebody would eventually rely on it.
 */
export function useLayer() {
  const [layer, setLayer] = useState<Layer>("both");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "both" || stored === "customer" || stored === "rider") {
        setLayer(stored);
      }
    } catch {
      // Storage disabled. `both` is a working panel.
    }
  }, []);

  const choose = (next: Layer) => {
    setLayer(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembering is survivable.
    }
  };

  return [layer, choose] as const;
}

const OPTIONS: { value: Layer; label: string; short: string }[] = [
  { value: "both", label: "Everything", short: "ALL" },
  { value: "customer", label: "Customer side", short: "CUS" },
  { value: "rider", label: "Partner side", short: "PTR" },
];

/**
 * The switch itself.
 *
 * A sliding marker rather than three backgrounds cross-fading, for the same
 * reason as the theme control and the nav indicator: one composited transform
 * beats three elements repainting.
 */
export function LayerSwitch({
  layer,
  onChange,
  collapsed,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
  collapsed: boolean;
}) {
  const index = OPTIONS.findIndex((o) => o.value === layer);

  if (collapsed) {
    // Cycles, like the theme control does when there is no room for three.
    return (
      <button
        type="button"
        onClick={() => onChange(OPTIONS[(index + 1) % OPTIONS.length]!.value)}
        title={`Showing: ${OPTIONS[index]?.label ?? "Everything"}`}
        aria-label={`Showing ${OPTIONS[index]?.label ?? "Everything"}. Click to change.`}
        className="motion-change mx-1 flex h-8 items-center justify-center rounded-md
                   border border-line bg-panel font-mono text-micro uppercase
                   text-fg-muted transition-colors hover:border-accent hover:text-accent"
      >
        {OPTIONS[index]?.short ?? "ALL"}
      </button>
    );
  }

  return (
    <div className="px-1 pb-2">
      <p className="px-2 pb-1.5 font-mono text-micro uppercase text-fg-faint">
        Showing
      </p>
      <div
        role="radiogroup"
        aria-label="Which side of the business to show"
        className="relative grid grid-cols-3 rounded-md border border-line bg-panel p-0.5"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-sm bg-surface
                     ring-1 ring-edge transition-transform duration-250
                     ease-[var(--ease-out-quint)] motion-reduce:transition-none"
          style={{
            width: "calc((100% - 4px) / 3)",
            transform: `translate3d(${index * 100}%, 0, 0)`,
          }}
        />
        {OPTIONS.map((option) => {
          const selected = option.value === layer;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              title={option.label}
              className={`motion-change relative z-10 h-7 font-mono text-micro uppercase
                          transition-colors ${
                            selected
                              ? "text-accent"
                              : "text-fg-faint hover:text-fg-mid"
                          }`}
            >
              {option.short}
              <span className="sr-only">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

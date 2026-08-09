"use client";

import type { ComponentPropsWithoutRef } from "react";

/** Chamfered primary action, matching the website's CTA shape. */
export function Button({
  className = "",
  loading = false,
  children,
  disabled,
  ...props
}: ComponentPropsWithoutRef<"button"> & { loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={`grad-accent chamfer-sm relative h-10 px-5 font-sans text-sm font-semibold
                  text-on-accent transition-[filter,transform] duration-150
                  hover:brightness-110 active:scale-[0.98]
                  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100
                  disabled:active:scale-100 ${className}`}
      {...props}
    >
      <span className={loading ? "opacity-0" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

export function GhostButton({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={`h-9 border border-edge px-3 font-sans text-[13px] text-fg-mid
                  transition-colors duration-150 hover:border-accent hover:text-accent
                  ${className}`}
      {...props}
    />
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`size-4 animate-spin ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Input({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return (
    <input
      className={`h-10 w-full border border-edge bg-panel px-3 font-sans text-sm text-fg
                  placeholder:text-fg-faint transition-colors duration-150
                  focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

/** Panel with the brand's bottom-right corner cut. */
export function Card({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`corner-cut border border-line bg-surface [box-shadow:var(--shadow-panel)]
                  ${className}`}
      {...props}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="inline-block h-[3px] w-[18px] bg-accent" />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[2.5px] text-accent">
        {children}
      </span>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "text-warn border-warn/40",
  assigned: "text-accent border-accent/40",
  arriving_pickup: "text-accent border-accent/40",
  picked_up: "text-accent border-accent/40",
  in_transit: "text-accent border-accent/40",
  delivered: "text-ok border-ok/40",
  cancelled: "text-danger border-danger/40",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Finding driver",
  assigned: "Assigned",
  arriving_pickup: "To pickup",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function StatusPill({ status }: { status: string }) {
  const live = !["delivered", "cancelled"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px]
                  uppercase tracking-wide ${
                    STATUS_STYLES[status] ?? "border-edge text-fg-muted"
                  }`}
    >
      {live && (
        <span className="relative grid size-1.5 place-items-center">
          <span className="absolute size-1.5 rounded-full bg-current [animation:pulse-ring_1.8s_ease-out_infinite]" />
          <span className="size-1.5 rounded-full bg-current" />
        </span>
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="animate-rise grid place-items-center px-6 py-16 text-center">
      <p className="font-sans text-sm text-fg-mid">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-fg-faint">{hint}</p>}
    </div>
  );
}

/** Placeholder rows that match the real row height, so nothing jumps on load. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-[52px]" />
      ))}
    </div>
  );
}

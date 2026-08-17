"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** One optional action. More than one turns a notice into a decision. */
  action?: { label: string; onClick: () => void };
}

/**
 * How long a success stays up.
 *
 * Errors are **never** auto-dismissed. An error the operator did not see is an
 * error that did not happen as far as they know, and the actions in this panel
 * — settling a payout, deactivating an admin, issuing a credit note — are not
 * things to be quietly unsure about.
 */
const SUCCESS_MS = 5_000;
const INFO_MS = 7_000;

/**
 * How many are shown at once.
 *
 * Three, oldest evicted. A stack that grows without limit covers the thing the
 * operator is working on, which is the opposite of helpful.
 */
const MAX_VISIBLE = 3;

interface ToastApi {
  success: (message: string, action?: Toast["action"]) => void;
  error: (message: string, action?: Toast["action"]) => void;
  info: (message: string, action?: Toast["action"]) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The panel's one notification surface.
 *
 * Before this existed, five pages each invented their own success and error
 * rendering: `security` used a `role="status"` paragraph, `access` put errors
 * inside the affected row, `analytics` used a Card, `live` used a bare
 * `<p role="alert">`. So the same event looked different depending where the
 * operator was — and any result that arrived after a navigation was simply
 * lost, because the component holding it had unmounted.
 *
 * Mounted by the panel layout, above `<main>`, so it survives page changes.
 *
 * **Inline errors are still right in some places** and this does not replace
 * them. A validation message belongs beside the field it concerns, and the
 * access page's per-row refusal ("you cannot change your own role") belongs on
 * that row. Toasts are for the outcome of an action, not for the state of a
 * form.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: Toast["action"]) => {
      // Date.now() would collide when two land in the same millisecond, which
      // is exactly what a Promise.all of two failed requests produces.
      const id = nextId++;

      setToasts((current) => [...current, { id, tone, message, action }].slice(-MAX_VISIBLE));

      if (tone !== "error") {
        setTimeout(() => dismiss(id), tone === "success" ? SUCCESS_MS : INFO_MS);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, action) => push("success", message, action),
      error: (message, action) => push("error", message, action),
      info: (message, action) => push("info", message, action),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

let nextId = 1;

/**
 * Reads the toast API.
 *
 * Throws when used outside the provider rather than silently doing nothing —
 * a component that thinks it reported an error and did not is worse than a
 * crash during development.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return api;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-l-ok",
  error: "border-l-danger",
  info: "border-l-accent",
};

const TONE_LABEL: Record<ToastTone, string> = {
  success: "Done",
  error: "Failed",
  info: "Note",
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    // `pointer-events-none` on the container with `auto` on each toast, so the
    // empty space beside them does not swallow clicks on the page underneath.
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))]
                 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // Success and info are status; a failure is an alert, which
          // interrupts a screen reader rather than waiting for a pause.
          role={toast.tone === "error" ? "alert" : "status"}
          className={`motion-enter corner-cut pointer-events-auto border border-line
                      border-l-2 bg-raised px-3.5 py-3 [box-shadow:var(--shadow-panel)]
                      ${TONE_STYLES[toast.tone]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-micro font-mono uppercase text-fg-muted">
                {TONE_LABEL[toast.tone]}
              </p>
              <p className="mt-0.5 text-body text-fg-soft">{toast.message}</p>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="motion-change -mr-1 -mt-1 shrink-0 px-1.5 py-0.5 text-fg-faint
                         transition-colors hover:text-fg"
            >
              ×
            </button>
          </div>

          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="motion-change mt-2 border border-edge px-2 py-1 text-micro font-mono
                         uppercase text-fg-mid transition-colors hover:border-accent
                         hover:text-accent"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

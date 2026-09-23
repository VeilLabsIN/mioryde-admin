"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GhostButton } from "@/components/ui";

/**
 * A document, at a size and angle the reviewer can actually read it at.
 *
 * ## Why this is not just an `<img>`
 *
 * The reviewer's job on an expiring document is to read a date off a
 * photograph taken by somebody else, on a phone, usually at night, and re-key
 * it — and since Approve is gated on the document having rendered, they are
 * blocked until they genuinely have. A fixed 28rem box is where that job used
 * to be done, and it is not enough for eight-point print on a licence.
 *
 * Phone captures also arrive rotated. The server bakes in whatever EXIF
 * orientation the camera recorded, but a photograph taken sideways with no
 * orientation tag stays sideways, and there was previously no way to correct
 * it. Rotation here is a view control only — it never writes anything back,
 * because the stored document is evidence and evidence does not get edited to
 * suit the person reviewing it.
 *
 * ## Why a transform, and not width and height
 *
 * Zoom and pan are one `transform` on a wrapper, so the browser composites it
 * rather than re-laying-out on every wheel tick. Changing the image's width
 * would reflow the drawer around it on every frame.
 */

/** Bounds on zoom. Below 1 the fit view covers it; above 8 it is pure mush. */
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const SCALE_STEP = 0.25;

export function DocumentViewer({
  src,
  alt,
  expiresInSeconds,
  onExpired,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  /** The server's TTL for this link, counted down so it never expires unseen. */
  expiresInSeconds: number;
  /** Ask for a fresh link. Shown as a button when the countdown reaches zero. */
  onExpired: () => void;
  /** Fires only when the browser has actually painted it — the approval gate. */
  onLoad: () => void;
  onError: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /**
   * Three states, not two.
   *
   * This was a boolean, and a failed load left it false — so the centred
   * "Loading the document…" stayed on screen forever, on top of the browser's
   * broken-image placeholder and its alt text. The two overlapped into an
   * unreadable smear, and the one thing the panel said out loud was that it
   * was still trying, which it was not.
   */
  const [phase, setPhase] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  /**
   * Whether the browser refused to load it, rather than failing to.
   *
   * A blocked image and a missing one are indistinguishable from `onerror`:
   * both give a broken placeholder and no reason. The difference matters
   * enormously — one is a document to chase the partner about, the other is a
   * header on the panel — and getting it wrong sent somebody round the
   * storage configuration for an afternoon while every check there passed.
   *
   * `securitypolicyviolation` fires on the document with the directive and
   * the URI that was refused, so the panel can say which it is instead of
   * guessing. Scoped to img-src and to this src, so a blocked script or
   * somebody else's image cannot claim to be this document.
   */
  const [blockedOrigin, setBlockedOrigin] = useState<string | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  /**
   * Seconds left on the signed URL.
   *
   * Counted down rather than left to fail, because the failure is silent: the
   * image is already painted, so an expired link looks exactly like a valid
   * one until something asks for it again. A reviewer who has been reading a
   * licence for three minutes should be told the link went stale, not discover
   * it when the next action fails.
   */
  const [secondsLeft, setSecondsLeft] = useState(expiresInSeconds);

  // Restart the countdown, and the view, whenever a different link arrives.
  // Adjusted during render rather than in an effect: an effect paints the
  // previous document's zoom for a frame before correcting it.
  const [shownSrc, setShownSrc] = useState(src);
  if (src !== shownSrc) {
    setShownSrc(src);
    setSecondsLeft(expiresInSeconds);
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setPhase("loading");
    setBlockedOrigin(null);
  }

  useEffect(() => {
    function onViolation(event: SecurityPolicyViolationEvent) {
      if (event.effectiveDirective !== "img-src") return;
      // The browser may truncate the blocked URI to its origin, which is all
      // that is wanted here anyway.
      if (!src.startsWith(event.blockedURI)) return;
      try {
        setBlockedOrigin(new URL(event.blockedURI).origin);
      } catch {
        setBlockedOrigin(event.blockedURI);
      }
      setPhase("failed");
    }

    document.addEventListener("securitypolicyviolation", onViolation);
    return () =>
      document.removeEventListener("securitypolicyviolation", onViolation);
  }, [src]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(
      () => setSecondsLeft((left) => Math.max(0, left - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta));
      // Back to centre when fully zoomed out, so a pan left over from a
      // previous zoom does not leave the fitted view sitting off to one side.
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Wheel-to-zoom is bound here rather than with onWheel, because React's
  // synthetic wheel listener is passive and cannot preventDefault — without
  // that, zooming the document scrolls the drawer behind it at the same time.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
    }

    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const expired = secondsLeft <= 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <GhostButton
          onClick={() => zoomBy(-SCALE_STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="Zoom out"
        >
          &minus;
        </GhostButton>
        <span
          className="text-fg-faint w-14 text-center text-xs tabular-nums"
          aria-live="polite"
        >
          {Math.round(scale * 100)}%
        </span>
        <GhostButton
          onClick={() => zoomBy(SCALE_STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="Zoom in"
        >
          +
        </GhostButton>
        <GhostButton
          onClick={() => setRotation((current) => (current + 90) % 360)}
          aria-label="Rotate 90 degrees"
        >
          Rotate
        </GhostButton>
        <GhostButton onClick={reset} disabled={scale === 1 && rotation === 0}>
          Fit
        </GhostButton>
      </div>

      <div
        ref={frameRef}
        className="border-edge bg-bg relative h-[26rem] overflow-hidden rounded border"
        // Grab rather than scrollbars: at 4x on a rotated licence, two
        // scrollbars inside a drawer is a worse way to reach a corner than
        // dragging to it.
        style={{ cursor: scale > 1 ? "grab" : "default" }}
        onPointerDown={(event) => {
          if (scale <= 1) return;
          dragFrom.current = {
            x: event.clientX - offset.x,
            y: event.clientY - offset.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = dragFrom.current;
          if (!from) return;
          setOffset({ x: event.clientX - from.x, y: event.clientY - from.y });
        }}
        onPointerUp={() => {
          dragFrom.current = null;
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
        }}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
              short-lived URL on the storage provider's host; next/image would
              proxy and optimise it, which fails once the signature expires. */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full object-contain select-none"
            onLoad={() => {
              setPhase("loaded");
              onLoad();
            }}
            onError={() => {
              setPhase("failed");
              onError();
            }}
          />
        </div>

        {phase !== "loaded" ? (
          // Covers the broken-image placeholder rather than sitting beside it.
          // A failed <img> still paints its alt text, and two messages layered
          // over each other is worse than either alone.
          <div className="bg-bg text-fg-faint absolute inset-0 grid place-items-center px-6 text-center text-sm">
            {phase === "loading"
              ? "Loading the document…"
              : blockedOrigin
                ? `The browser blocked this image: ${blockedOrigin} is not allowed by the panel's img-src policy. Add it to NEXT_PUBLIC_DOCUMENT_ORIGIN — the document itself is fine.`
                : "This document could not be displayed."}
          </div>
        ) : null}
      </div>

      {expired ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-warn text-xs">
            This link has expired. What is on screen may be stale.
          </p>
          <GhostButton onClick={onExpired}>Get a fresh link</GhostButton>
        </div>
      ) : (
        <p className="text-fg-faint text-xs tabular-nums">
          {/* The server's own number, counted down. This used to be prose
              reading "about two minutes", against a field the server never
              sent (A4). */}
          Link expires in {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, "0")}
        </p>
      )}
    </div>
  );
}

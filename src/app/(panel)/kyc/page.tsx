"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  GhostButton,
  Pager,
  SectionLabel,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { DetailDrawer } from "@/components/DetailDrawer";
import { PhotoContactSheet } from "@/components/PhotoContactSheet";
import { SelectionBar } from "@/components/SelectionBar";
import { isBulkApprovable } from "@/lib/bulkReview";
import { DocumentViewer } from "@/components/DocumentViewer";
import {
  ApiError,
  type CountersignItem,
  type KycPartnerGroup,
  type PendingVehicle,
  api,
} from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";
import { useAsync, usePagedAsync } from "@/lib/useAsync";
import {
  type ReviewRow,
  documentLabel,
  flattenCountersignRows,
  flattenPartnerRows,
  formatWhen,
  partnerRowOffsets,
} from "@/lib/kycQueue";

/**
 * Reasons a document can be turned down.
 *
 * Codes rather than free text, so the partner app shows a translated message
 * that says what to do. An operator typing "bad photo" at 6pm produces a
 * rejection nobody can act on and a support call the next morning.
 *
 * The order is the keyboard order: `1`-`6` pick these, top to bottom. Adding a
 * seventh means deciding what key it gets, which is the right amount of
 * friction for a list partners read translated.
 */
const REJECT_CODES = [
  { value: "blurred", label: "Too blurry to read" },
  { value: "incomplete", label: "Cut off / incomplete" },
  { value: "expired", label: "Expired" },
  { value: "wrong_document", label: "Wrong document" },
  { value: "name_mismatch", label: "Name does not match" },
  { value: "suspected_forgery", label: "Suspected forgery" },
] as const;

type Tab = "review" | "countersign" | "vehicles";

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "review", label: "To review" },
  { value: "countersign", label: "Second signature" },
  { value: "vehicles", label: "Vehicles" },
];

/**
 * Partner verification.
 *
 * Three queues rather than one list, because they are three different jobs.
 * Reviewing a fresh document is a judgement about a photograph; countersigning
 * is a second opinion on somebody else's judgement (§4.10); approving a vehicle
 * is a decision about a van's paperwork. Merging them would mean an operator
 * never knows which of the three they are doing.
 */
export default function KycPage() {
  // The tab is in the URL, so "the countersign queue" is a link somebody can
  // send. "review" is the fallback, so the default view has a clean address.
  const [tabRaw, setTabRaw, tabReady] = useUrlParam("tab", "review");
  // An unrecognised ?tab= reads as the first queue rather than rendering
  // nothing — the same fail-safe direction the apps use for unknown wire
  // values.
  const tab: Tab = TABS.some((t) => t.value === tabRaw)
    ? (tabRaw as Tab)
    : "review";
  const [page, setPage, pageReady] = useUrlPage();
  const urlReady = tabReady && pageReady;
  /**
   * Things a decision turned up that outlive the row it happened on.
   *
   * Today that is only an expiry the partner declared differently from what
   * the document says. It has to survive the reload — the row disappears the
   * moment the decision lands, and a warning that vanishes with it is one
   * nobody can act on. Kept until the operator dismisses it, because acting on
   * it means opening that partner's other documents, which takes longer than a
   * toast.
   */
  const [notices, setNotices] = useState<string[]>([]);

  /*
   * One request, one queue.
   *
   * Only one of the three is ever on screen, and this used to be three pieces
   * of state that could all hold rows at once — so a tab switch showed the
   * *previous* queue's rows until the new ones landed, under the new tab's
   * heading. Keyed on the tab, there is nothing to show it from.
   *
   * One `page` and one `meta` across all three for the same reason. Per-tab
   * paging state would let an operator return to a tab and find themselves on
   * page four of a queue they thought they had left at the top.
   *
   * The tab is carried on the result so the rows can be narrowed back to the
   * queue that asked for them — the three endpoints return the same shape and
   * nothing in the payload itself says which one it came from.
   */
  const {
    rows,
    data,
    meta,
    error,
    reload: load,
  } = usePagedAsync(
    async () => {
      const result =
        tab === "review"
          ? { tab: "review" as const, ...(await api.kycQueue(page)) }
          : tab === "countersign"
            ? {
                tab: "countersign" as const,
                ...(await api.kycCountersignQueue(page)),
              }
            : {
                tab: "vehicles" as const,
                ...(await api.pendingVehicles(page)),
              };

      // Past the end. The page below is the answer, not an empty queue.
      if (result.page.beyondEnd) {
        setPage(0);
        return null;
      }
      return result;
    },
    [tab, page],
    { enabled: urlReady, fallback: "Could not load the queue." },
  );

  // `rows` is null exactly when nothing should be shown — loading, or failed.
  const shown = rows === null ? null : data;
  const partners = shown?.tab === "review" ? shown.results : null;
  const countersign = shown?.tab === "countersign" ? shown.results : null;
  const vehicles = shown?.tab === "vehicles" ? shown.results : null;

  const addNotice = useCallback((message: string) => {
    // Deduplicated: re-deciding the same document should not stack two
    // identical warnings the operator then has to dismiss twice.
    setNotices((current) =>
      current.includes(message) ? current : [...current, message],
    );
  }, []);

  /**
   * Every document on this page, in the order it is painted.
   *
   * This is what `j` and `k` walk. Derived rather than stored, so it cannot
   * drift from what is on screen after a decision removes a row — a stale
   * index here would open a document the reviewer is not looking at, which on
   * this screen is the one mistake that matters.
   */
  const reviewRows: ReviewRow[] = useMemo(() => {
    if (partners) return flattenPartnerRows(partners, formatWhen);
    if (countersign) return flattenCountersignRows(countersign, formatWhen);
    return [];
  }, [partners, countersign]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A shorter queue must not leave the cursor past the end. Adjusted during
  // render rather than in an effect, so an out-of-range index is never used to
  // paint a highlight on nothing.
  const [countWhenSet, setCountWhenSet] = useState(reviewRows.length);
  if (reviewRows.length !== countWhenSet) {
    setCountWhenSet(reviewRows.length);
    if (activeIndex >= reviewRows.length) {
      setActiveIndex(Math.max(0, reviewRows.length - 1));
    }
  }

  const focusRow = useCallback((index: number) => {
    setActiveIndex(index);
    rowRefs.current[index]?.focus();
    rowRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, []);

  /**
   * `j`, `k` and Enter over the queue.
   *
   * Bound on the document rather than on the list, because after closing the
   * drawer focus returns to the row, and requiring the reviewer to click back
   * into a container first would undo the point. Suppressed while the drawer
   * is open — the drawer has its own keys — and while anything is being typed
   * into, so `j` in a rejection note stays a `j`.
   */
  useEffect(() => {
    if (openIndex !== null || reviewRows.length === 0) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        focusRow(Math.min(reviewRows.length - 1, activeIndex + 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        focusRow(Math.max(0, activeIndex - 1));
      } else if (event.key === "Enter") {
        // Only when the cursor is on a row. Enter on the pager or a tab is
        // still that control's Enter.
        if (document.activeElement === rowRefs.current[activeIndex]) {
          event.preventDefault();
          setOpenIndex(activeIndex);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, focusRow, openIndex, reviewRows.length]);

  const openRow = openIndex === null ? null : (reviewRows[openIndex] ?? null);

  /**
   * After a decision, reload and stay where the reviewer was.
   *
   * The drawer closes because the document it was showing no longer exists.
   * Keeping the index means the next document slides up under the cursor, so
   * the next Enter opens the next one — which is what makes a queue of a
   * thousand documents a job rather than a thousand round trips to the mouse.
   */
  const onDecided = useCallback(() => {
    setOpenIndex(null);
    load();
  }, [load]);

  /*
   * A10 — several photos, seen together and approved once.
   *
   * The selection is document ids rather than indexes. Indexes shift the
   * moment anything is approved and the queue reloads, and a selection that
   * silently slides onto different documents on a screen that approves
   * identity paperwork is not a bug worth risking for the convenience of an
   * array lookup.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);

  const selectable = useMemo(
    () => reviewRows.filter(isBulkApprovable),
    [reviewRows],
  );
  // Only ids still on screen. A document approved elsewhere, or paged away
  // from, must not stay counted in a bar that offers to act on it.
  const chosen = useMemo(
    () => selectable.filter((row) => selected.has(row.documentId)),
    [selectable, selected],
  );

  const toggleSelected = useCallback((documentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(documentId)) next.add(documentId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner verification"
        subtitle="Identity documents need two different people to approve them."
      />

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <GhostButton
            key={item.value}
            onClick={() => {
              // Switching queue starts at the top of the new one.
              setPage(0);
              setActiveIndex(0);
              setTabRaw(item.value);
            }}
            className={
              tab === item.value ? "border-accent text-fg" : "text-fg-faint"
            }
          >
            {item.label}
          </GhostButton>
        ))}

        {tab === "vehicles" ? null : <ShortcutLegend />}
      </div>

      {error ? (
        <Card>
          <p className="text-warn text-sm">{error}</p>
          <Button className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      ) : null}

      {notices.map((notice, index) => (
        <Card key={notice}>
          <p className="text-warn text-sm">{notice}</p>
          <GhostButton
            className="mt-3"
            onClick={() =>
              setNotices((current) => current.filter((_, at) => at !== index))
            }
          >
            Dismiss
          </GhostButton>
        </Card>
      ))}

      {tab === "review" ? (
        <ReviewQueue
          partners={partners}
          activeIndex={activeIndex}
          rowRefs={rowRefs}
          onOpen={setOpenIndex}
          onFocusRow={setActiveIndex}
          selected={selected}
          onToggleSelected={toggleSelected}
        />
      ) : tab === "countersign" ? (
        <CountersignQueue
          items={countersign}
          activeIndex={activeIndex}
          rowRefs={rowRefs}
          onOpen={setOpenIndex}
          onFocusRow={setActiveIndex}
        />
      ) : (
        <VehicleQueue items={vehicles} onDone={load} />
      )}

      {meta && (
        <Pager
          page={meta}
          noun={
            tab === "vehicles"
              ? "vehicles to approve"
              : tab === "countersign"
                ? "awaiting a second signature"
                : // The review queue pages by partner now, so the count under
                  // it counts partners. Saying "documents" against a number of
                  // people is how a queue of 40 looks like a queue of 400.
                  "partners waiting"
          }
          onChange={setPage}
        />
      )}

      {tab === "review" && !sheetOpen && (
        <SelectionBar
          count={chosen.length}
          noun="photo"
          onClear={clearSelection}
        >
          <GhostButton
            className="border-ok/50 text-ok hover:border-ok"
            onClick={() => setSheetOpen(true)}
          >
            Review together
          </GhostButton>
        </SelectionBar>
      )}

      <DetailDrawer
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Profile photos"
        subtitle="Approving these records a decision against each one."
      >
        {sheetOpen ? (
          <PhotoContactSheet
            // Keyed on exactly which documents, so a reload that changes the
            // set rebuilds the sheet rather than leaving approved photos in it.
            key={chosen.map((row) => row.documentId).join(",")}
            rows={chosen}
            onClose={() => setSheetOpen(false)}
            onFinished={(approved) => {
              clearSelection();
              setSheetOpen(false);
              addNotice(
                `${approved} profile ${approved === 1 ? "photo" : "photos"} approved.`,
              );
              load();
            }}
          />
        ) : null}
      </DetailDrawer>

      <DetailDrawer
        open={openRow !== null}
        onClose={() => setOpenIndex(null)}
        title={openRow?.label ?? ""}
        subtitle={
          openRow ? `${openRow.riderName} · ${openRow.meta}` : undefined
        }
      >
        {openRow ? (
          <DocumentReview
            // Keyed on the document, so moving to the next one resets the
            // viewer, the render gate and any half-typed rejection rather than
            // carrying them onto a different person's licence.
            key={openRow.documentId}
            row={openRow}
            onDone={onDecided}
            onNotice={addNotice}
          />
        ) : null}
      </DetailDrawer>
    </div>
  );
}

/** Whether a keystroke belongs to something the operator is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The keys, where somebody can find them.
 *
 * A keyboard workflow nobody knows about is a keyboard workflow nobody uses,
 * and these shortcuts are most of the difference between this queue being a
 * job and not.
 */
function ShortcutLegend() {
  const [open, setOpen] = useState(false);

  const keys: ReadonlyArray<readonly [string, string]> = [
    ["j / k", "Move down / up the queue"],
    ["Enter", "Open the document"],
    ["a", "Approve"],
    ["r", "Start a rejection"],
    ["1 – 6", "Pick a rejection reason"],
    ["Esc", "Close"],
  ];

  return (
    <div className="relative ml-auto">
      <GhostButton
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        Keyboard
      </GhostButton>
      {open ? (
        <div className="border-edge bg-panel absolute right-0 z-10 mt-1 w-64 rounded border p-3 text-xs [box-shadow:var(--elev-2)]">
          <dl className="space-y-1.5">
            {keys.map(([combination, what]) => (
              <div key={combination} className="flex justify-between gap-3">
                <dt className="text-fg font-mono">{combination}</dt>
                <dd className="text-fg-muted text-right">{what}</dd>
              </div>
            ))}
          </dl>
          <p className="text-fg-faint mt-2">
            {/* The thing a shortcut list on this particular screen has to
                say: speed is not an exemption from looking. */}
            Approve stays locked until the document has rendered, whichever way
            you press it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReviewQueue({
  partners,
  activeIndex,
  rowRefs,
  onOpen,
  onFocusRow,
  selected,
  onToggleSelected,
}: {
  partners: KycPartnerGroup[] | null;
  activeIndex: number;
  rowRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  onOpen: (index: number) => void;
  onFocusRow: (index: number) => void;
  selected: ReadonlySet<string>;
  onToggleSelected: (documentId: string) => void;
}) {
  if (partners === null) return <SkeletonRows />;
  if (partners.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        hint="Every submitted document has been looked at."
      />
    );
  }

  // Where each partner's documents start in the flat row list the keyboard
  // moves through, from the same array in the same order — so the two cannot
  // disagree about which row is the fourth one.
  const startIndexes = partnerRowOffsets(partners);

  return (
    <div className="space-y-4">
      {partners.map((partner, partnerIndex) => (
        <Card key={partner.riderId}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-medium">{partner.riderName}</p>
              <p className="text-fg-faint text-sm">
                Waiting since {formatWhen(partner.oldestUploadedAt)} ·{" "}
                {partner.riderStage.replace(/_/g, " ")}
              </p>
            </div>
            <p className="text-fg-faint text-sm">
              {/* Where this partner stands — not a progress bar against an
                  invented total. How many documents they owe depends on how
                  many vehicles they have registered. */}
              {partner.documents.length} waiting
              {partner.approvedCount > 0
                ? ` · ${partner.approvedCount} approved`
                : ""}
              {partner.awaitingSecondCount > 0
                ? ` · ${partner.awaitingSecondCount} need a second signature`
                : ""}
            </p>
          </div>

          <ul className="mt-3 space-y-1">
            {partner.documents.map((document, documentIndex) => {
              const index = (startIndexes[partnerIndex] ?? 0) + documentIndex;
              return (
                <li key={document.id}>
                  <DocumentRow
                    label={documentLabel(document.label, document.side)}
                    meta={`Uploaded ${formatWhen(document.uploadedAt)}`}
                    isActive={index === activeIndex}
                    hasExpiry={document.expiryRequired}
                    rowRef={(element) => {
                      rowRefs.current[index] = element;
                    }}
                    onOpen={() => onOpen(index)}
                    onFocus={() => onFocusRow(index)}
                    selection={
                      isBulkApprovable({
                        documentId: document.id,
                        kind: document.kind,
                        label: document.label,
                        riderName: partner.riderName,
                        meta: "",
                        expiryRequired: document.expiryRequired,
                        mode: "review",
                      })
                        ? {
                            checked: selected.has(document.id),
                            onChange: () => onToggleSelected(document.id),
                            label: `Select ${partner.riderName}'s ${document.label.toLowerCase()} for batch approval`,
                          }
                        : null
                    }
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function CountersignQueue({
  items,
  activeIndex,
  rowRefs,
  onOpen,
  onFocusRow,
}: {
  items: CountersignItem[] | null;
  activeIndex: number;
  rowRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  onOpen: (index: number) => void;
  onFocusRow: (index: number) => void;
}) {
  if (items === null) return <SkeletonRows />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to countersign"
        hint="Documents you approved yourself are not listed here — a second signature has to come from someone else."
      />
    );
  }

  return (
    <Card>
      {/* Flat, not grouped by partner. Countersigning genuinely is a
          per-document job: it is a second opinion on one judgement somebody
          else made, and gathering these by person would suggest the partner is
          the unit of work when the signature is. */}
      <SectionLabel>Awaiting a second signature</SectionLabel>
      <ul className="mt-3 space-y-1">
        {items.map((item, index) => (
          <li key={item.id}>
            <DocumentRow
              label={`${documentLabel(item.label, item.side)} · ${item.riderName}`}
              meta={`First approved by ${item.firstReviewerName ?? "a colleague"} ${formatWhen(item.firstReviewedAt)}`}
              isActive={index === activeIndex}
              hasExpiry={item.expiryRequired}
              rowRef={(element) => {
                rowRefs.current[index] = element;
              }}
              onOpen={() => onOpen(index)}
              onFocus={() => onFocusRow(index)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One document in the queue, opened by clicking anywhere on it.
 *
 * A `button` rather than a `div` with a click handler: that is what makes it
 * reachable by Tab, operable with Enter and Space, and announced as something
 * that does a thing — all of which a div needs re-implementing by hand, and
 * usually only half of which gets implemented.
 *
 * There is no thumbnail here on purpose. Rendering one means asking the server
 * for the document, and the server writes a §13.12 access row every time it is
 * asked — a log saying a reviewer opened forty identity documents because they
 * loaded a page is worse than no log at all. The document is fetched when
 * somebody opens it, which is the event worth recording.
 */
function DocumentRow({
  label,
  meta,
  isActive,
  hasExpiry,
  rowRef,
  onOpen,
  onFocus,
  selection = null,
}: {
  label: string;
  meta: string;
  isActive: boolean;
  hasExpiry: boolean;
  rowRef: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onFocus: () => void;
  /**
   * The batch checkbox, on the kinds that may be batched. Null on the rest,
   * rather than a disabled box — a disabled control on every identity document
   * in the queue reads as something that might become available, and it never
   * will.
   *
   * A sibling of the row button, never inside it: a control nested in a button
   * is not reachable by keyboard in the way it appears to be, and clicking it
   * would also open the drawer.
   */
  selection?: {
    checked: boolean;
    onChange: () => void;
    label: string;
  } | null;
}) {
  const activeClasses = isActive
    ? "border-accent bg-panel"
    : "border-transparent hover:bg-panel";

  const row = (
    <button
      ref={rowRef}
      type="button"
      onClick={onOpen}
      onFocus={onFocus}
      // Only the cursor row is in the tab order, so Tab leaves the queue for
      // the pager instead of walking a thousand documents one at a time; j/k
      // and the arrows move within it. This is the standard roving-tabindex
      // arrangement for a long list of peers.
      tabIndex={isActive ? 0 : -1}
      className={`flex w-full items-center justify-between gap-3 rounded-xs border px-3
                  py-2 text-left transition-colors duration-[var(--dur-fast)] ${activeClasses}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm">{label}</span>
        <span className="text-fg-faint block truncate text-xs">{meta}</span>
      </span>
      {hasExpiry ? (
        <span className="text-fg-faint shrink-0 text-xs">needs expiry</span>
      ) : null}
    </button>
  );

  if (!selection) return row;

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={selection.checked}
        onChange={selection.onChange}
        aria-label={selection.label}
        className="accent-ok ml-1 h-3.5 w-3.5 shrink-0"
      />
      <div className="min-w-0 flex-1">{row}</div>
    </div>
  );
}

/**
 * One document, and the decision about it, inside the drawer.
 *
 * The document is fetched as soon as this mounts — unlike the queue, opening
 * the drawer *is* the operator asking to see it, so the §13.12 access row this
 * writes is exactly the event that record exists for.
 */
function DocumentReview({
  row,
  onDone,
  onNotice,
}: {
  row: ReviewRow;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const { documentId, label, riderName, expiryRequired, mode } = row;

  /**
   * Whether the preview has actually appeared on screen.
   *
   * **Not** the same question as "did the request return", which is what this
   * screen used to gate Approve on. The two came apart because every document
   * URL is served as an `attachment`, which a browser will not render in an
   * `<img>` — so the fetch succeeded, nothing was displayed, and Approve
   * unlocked anyway (A2). Set from the image's own `onLoad`, so it cannot be
   * true unless pixels reached the reviewer.
   */
  const [hasRendered, setHasRendered] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [code, setCode] = useState<string>(REJECT_CODES[0].value);
  const [note, setNote] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [expiry, setExpiry] = useState("");

  /**
   * The document itself, fetched as soon as the drawer opens.
   *
   * Through the panel's own loader rather than an effect that sets state: the
   * request token is what discards a response for a document the reviewer has
   * already moved off, which on this screen would mean showing one person's
   * licence under another person's name.
   *
   * Opening the drawer *is* the operator asking to see it, so the §13.12
   * access row this writes is exactly the event that record exists for.
   */
  const {
    data: view,
    error: openError,
    loading: isOpening,
    reload: reopen,
  } = useAsync(() => api.viewKycDocument(documentId), [documentId], {
    fallback: "Could not open it.",
  });

  // A fresh link means a fresh render, and the old one may have expired — so
  // the gate closes again until pixels arrive from the new URL. Adjusted
  // during render rather than in an effect, so Approve is never briefly
  // enabled against a document that is no longer on screen.
  const [gatedFor, setGatedFor] = useState<string | null>(null);
  const viewKey = view?.url ?? null;
  if (viewKey !== gatedFor) {
    setGatedFor(viewKey);
    setHasRendered(false);
  }

  const canApprove = !isBusy && hasRendered && !(expiryRequired && !expiry);

  /**
   * What to tell the reviewer, in the order it matters.
   *
   * A decision that failed comes first — it is the thing they just tried to
   * do. Then a document that would not load, then one that loaded but cannot
   * be displayed: nothing will render it, so nothing will set `hasRendered`,
   * and a disabled Approve with no reason beside it reads as a broken screen.
   */
  const notRenderable =
    view && !view.renderable
      ? (view.renditionError ??
        "This document is a PDF, so it downloads rather than opening here. " +
          "Open the downloaded file, then confirm below.")
      : null;
  const problem = actionProblem ?? openError ?? notRenderable;

  const decide = useCallback(
    async (decision: "approve" | "reject") => {
      setIsBusy(true);
      setActionProblem(null);
      try {
        const options =
          decision === "reject"
            ? { rejectCode: code, note: note || undefined }
            : // Sent as the plain `YYYY-MM-DD` the input produces. Converting
              // it to an instant here would apply the *browser's* timezone, so
              // a reviewer on a laptop set to UTC would file a licence a day
              // early. The server reads a bare date as the end of that day in
              // India, which is the one place that decision belongs.
              { expiresAt: expiryRequired ? expiry : undefined };

        const result =
          mode === "review"
            ? await api.reviewKycDocument(documentId, decision, options)
            : await api.countersignKycDocument(documentId, decision, options);

        // Raised to the page rather than shown in the drawer, because the
        // drawer is about to close — this is the one thing about the decision
        // that should outlive it.
        //
        // Approving an identity document does not approve it. Aadhaar, PAN and
        // driving licence need two signatures from two different people
        // (§4.10), so this decision moved the document to `awaiting_second` —
        // and the partner's app shows it as still in review, correctly,
        // because from their side nothing has finished.
        if (result?.awaitingSecondSignature) {
          onNotice(
            `${riderName}: ${label.toLowerCase()} approved, and now needs a ` +
              "second signature from a different admin before it counts. It is " +
              "in the Second signature tab — for them, not for you.",
          );
        }

        // A partner whose claim differs from their own document is worth a
        // second look at their other papers, and nobody would ever go and
        // search the audit log for that.
        if (result?.expiryMismatch) {
          onNotice(
            `${riderName}: ${label.toLowerCase()} recorded as ` +
              `${result.verifiedExpiresAt?.slice(0, 10)}, but they declared ` +
              `${result.declaredExpiresAt?.slice(0, 10)}. Your reading is the one ` +
              "that counts — worth checking their other documents.",
          );
        }
        onDone();
      } catch (caught) {
        setActionProblem(
          caught instanceof ApiError ? caught.message : "Could not save that.",
        );
        setIsBusy(false);
      }
    },
    [
      code,
      documentId,
      expiry,
      expiryRequired,
      label,
      mode,
      note,
      onDone,
      onNotice,
      riderName,
    ],
  );

  /**
   * `a`, `r` and `1`-`6` inside the drawer.
   *
   * Approve is bound to the same `canApprove` the button is, so the keystroke
   * is a faster way to express a decision and never a way to skip looking —
   * the one property this screen exists to preserve. Escape is the drawer's
   * own and is not re-bound here.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === "a") {
        if (isRejecting || !canApprove) return;
        event.preventDefault();
        void decide("approve");
        return;
      }

      if (event.key === "r") {
        if (isBusy) return;
        event.preventDefault();
        setIsRejecting(true);
        return;
      }

      // Reason keys mean something only once a rejection is under way, so `3`
      // never silently arms a reason the reviewer cannot see selected.
      if (isRejecting && /^[1-6]$/.test(event.key)) {
        const chosen = REJECT_CODES[Number(event.key) - 1];
        if (chosen) {
          event.preventDefault();
          setCode(chosen.value);
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isBusy, canApprove, decide, isRejecting]);

  return (
    <div className="space-y-4">
      {isOpening ? (
        <p className="text-fg-faint text-sm">Opening the document…</p>
      ) : null}

      {view?.renderable ? (
        <DocumentViewer
          src={view.url}
          alt={`${label} for ${riderName}`}
          expiresInSeconds={view.expiresInSeconds}
          onExpired={reopen}
          // The gate. Approve cannot unlock until this fires, and it fires only
          // when the browser has actually painted the document.
          onLoad={() => setHasRendered(true)}
          onError={() => {
            setHasRendered(false);
            setActionProblem(
              "The preview did not load. The link may have expired — reopen it.",
            );
          }}
        />
      ) : view ? (
        <div>
          {/* No rendition: a PDF, or bytes that would not decode. The original
              is still reachable and still downloads — the difference is that
              the reviewer is told so, instead of being shown a broken image
              and left to guess (A1). */}
          <a
            href={view.url}
            className="border-edge inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"
          >
            Download to read it
          </a>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasRendered}
              onChange={(event) => setHasRendered(event.target.checked)}
              className="mt-0.5"
            />
            {/* A weaker gate than the rendered one, and deliberately so: the
                panel cannot observe a file opened outside the browser, so for
                these it has to take the reviewer's word. Recorded here so
                nobody mistakes it for the same assurance. Removed once PDFs
                rasterise server-side (A23). */}
            <span>I have opened this file and read it.</span>
          </label>
        </div>
      ) : null}

      {problem ? <p className="text-warn text-sm">{problem}</p> : null}

      {expiryRequired && hasRendered ? (
        <div>
          <label
            htmlFor={`expiry-${documentId}`}
            className="text-fg-faint block text-xs"
          >
            Expiry date, as written on the document
          </label>
          <input
            id={`expiry-${documentId}`}
            type="date"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className="border-edge bg-bg mt-1 rounded border px-3 py-2 text-sm"
          />
          <p className="text-fg-faint mt-1 text-xs">
            {/* Says why it is empty, so nobody reports it as a bug or goes
                looking for the partner's answer to copy. */}
            Not pre-filled on purpose — read it off the document rather than
            from what the partner typed.
            {mode === "countersign"
              ? " Your reading is compared with the first reviewer's; if they disagree, neither is recorded."
              : ""}
          </p>
        </div>
      ) : null}

      {isRejecting ? (
        <div className="space-y-3">
          <select
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="border-edge bg-bg w-full rounded border px-3 py-2 text-sm"
          >
            {REJECT_CODES.map((option, index) => (
              <option key={option.value} value={option.value}>
                {index + 1}. {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything else the partner should know (optional)"
            rows={2}
            maxLength={300}
            className="border-edge bg-bg w-full rounded border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => void decide("reject")} disabled={isBusy}>
              Confirm rejection
            </Button>
            <GhostButton
              onClick={() => setIsRejecting(false)}
              disabled={isBusy}
            >
              Cancel
            </GhostButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void decide("approve")} disabled={!canApprove}>
            {mode === "countersign" ? "Countersign" : "Approve"}
          </Button>
          <GhostButton onClick={() => setIsRejecting(true)} disabled={isBusy}>
            Reject
          </GhostButton>
          {!hasRendered ? (
            // Approving something you have not looked at is the failure this
            // whole screen exists to prevent, so the button stays disabled
            // until the document has actually been *rendered* — not merely
            // requested, which is all this used to check (A2).
            <span className="text-fg-faint text-xs">
              {view
                ? "Confirm you have read it before deciding"
                : "Waiting for the document"}
            </span>
          ) : expiryRequired && !expiry ? (
            <span className="text-fg-faint text-xs">
              Enter the expiry date to approve
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function VehicleQueue({
  items,
  onDone,
}: {
  items: PendingVehicle[] | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (items === null) return <SkeletonRows />;
  if (items.length === 0) {
    return (
      <EmptyState title="No vehicles waiting" hint="Nothing to approve." />
    );
  }

  const decide = async (
    item: PendingVehicle,
    decision: "approve" | "reject",
  ) => {
    setBusy(item.vehicleId);
    try {
      await api.reviewVehicle(item.vehicleId, item.riderId, decision);
      onDone();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={`${item.vehicleId}:${item.riderId}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono font-medium">{item.registrationNumber}</p>
              <p className="text-fg-faint text-sm">
                {item.vehicleType}
                {item.make ? ` · ${item.make}` : ""}
                {item.model ? ` ${item.model}` : ""}
              </p>
              <p className="mt-1 text-sm">{item.riderName}</p>
              {item.isThirdParty ? (
                // §7.9: a partner may drive somebody else's vehicle, but the
                // reviewer needs to know that is what they are approving.
                <p className="text-warn mt-1 text-xs">
                  Third-party vehicle
                  {item.ownerName ? ` · owner: ${item.ownerName}` : ""}
                </p>
              ) : null}
              <p className="text-fg-faint mt-1 text-xs">
                {item.approvedDocuments} approved document
                {item.approvedDocuments === 1 ? "" : "s"} on file
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => decide(item, "approve")}
                disabled={busy === item.vehicleId}
              >
                Approve
              </Button>
              <GhostButton
                onClick={() => decide(item, "reject")}
                disabled={busy === item.vehicleId}
              >
                Reject
              </GhostButton>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

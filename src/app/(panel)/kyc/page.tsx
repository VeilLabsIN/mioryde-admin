"use client";

import { useCallback, useState } from "react";
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
import {
  ApiError,
  type CountersignItem,
  type KycDocumentView,
  type KycQueueItem,
  type PendingVehicle,
  api,
} from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";
import { usePagedAsync } from "@/lib/useAsync";

/**
 * Reasons a document can be turned down.
 *
 * Codes rather than free text, so the partner app shows a translated message
 * that says what to do. An operator typing "bad photo" at 6pm produces a
 * rejection nobody can act on and a support call the next morning.
 */
const REJECT_CODES = [
  { value: "blurred", label: "Too blurry to read" },
  { value: "incomplete", label: "Cut off / incomplete" },
  { value: "expired", label: "Expired" },
  { value: "wrong_document", label: "Wrong document" },
  { value: "name_mismatch", label: "Name does not match" },
  { value: "suspected_forgery", label: "Suspected forgery" },
] as const;

/**
 * The document's name, including which face of it this is.
 *
 * A licence and an Aadhaar are each uploaded as two objects, and the server
 * has said which is which since 0052 — the panel simply never read the field,
 * so the queue showed two rows reading "Driving licence" for the same partner
 * and a reviewer had to open both to tell them apart (A6).
 *
 * `single` adds nothing: most kinds have one face, and "Insurance — single"
 * is noise on every row of the queue to no benefit.
 */
function documentLabel(label: string, side: string): string {
  if (side === "front") return `${label} — front`;
  if (side === "back") return `${label} — back`;
  return label;
}

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
   * Things a decision turned up that outlive the card it happened on.
   *
   * Today that is only an expiry the partner declared differently from what
   * the document says. It has to survive the reload — the card disappears the
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
            : { tab: "vehicles" as const, ...(await api.pendingVehicles(page)) };

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
  const queue = shown?.tab === "review" ? shown.results : null;
  const countersign = shown?.tab === "countersign" ? shown.results : null;
  const vehicles = shown?.tab === "vehicles" ? shown.results : null;

  const addNotice = useCallback((message: string) => {
    // Deduplicated: re-deciding the same document should not stack two
    // identical warnings the operator then has to dismiss twice.
    setNotices((current) =>
      current.includes(message) ? current : [...current, message],
    );
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner verification"
        subtitle="Identity documents need two different people to approve them."
      />

      <div className="flex gap-2">
        {TABS.map((item) => (
          <GhostButton
            key={item.value}
            onClick={() => {
              // Switching queue starts at the top of the new one.
              setPage(0);
              setTabRaw(item.value);
            }}
            className={
              tab === item.value ? "border-accent text-fg" : "text-fg-faint"
            }
          >
            {item.label}
          </GhostButton>
        ))}
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
        <ReviewQueue items={queue} onDone={load} onNotice={addNotice} />
      ) : tab === "countersign" ? (
        <CountersignQueue
          items={countersign}
          onDone={load}
          onNotice={addNotice}
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
                : "documents to review"
          }
          onChange={setPage}
        />
      )}
    </div>
  );
}

function ReviewQueue({
  items,
  onDone,
  onNotice,
}: {
  items: KycQueueItem[] | null;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  if (items === null) return <SkeletonRows />;
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        hint="Every submitted document has been looked at."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <DocumentCard
          key={item.id}
          documentId={item.id}
          label={documentLabel(item.label, item.side)}
          riderName={item.riderName}
          meta={`Uploaded ${formatWhen(item.uploadedAt)}`}
          expiryRequired={item.expiryRequired}
          onDone={onDone}
          onNotice={onNotice}
          mode="review"
        />
      ))}
    </div>
  );
}

function CountersignQueue({
  items,
  onDone,
  onNotice,
}: {
  items: CountersignItem[] | null;
  onDone: () => void;
  onNotice: (message: string) => void;
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
    <div className="space-y-3">
      {items.map((item) => (
        <DocumentCard
          key={item.id}
          documentId={item.id}
          label={documentLabel(item.label, item.side)}
          riderName={item.riderName}
          meta={`First approved by ${item.firstReviewerName ?? "a colleague"} ${formatWhen(item.firstReviewedAt)}`}
          expiryRequired={item.expiryRequired}
          onDone={onDone}
          onNotice={onNotice}
          mode="countersign"
        />
      ))}
    </div>
  );
}

/**
 * One document, and the decision about it.
 *
 * The image is loaded only when an operator asks for it. Rendering every
 * document in the queue would write an access audit row for each — §13.12
 * restricts who may look at identity documents, and a record saying an
 * operator opened forty of them because they loaded a page is worse than no
 * record at all.
 */
function DocumentCard({
  documentId,
  label,
  riderName,
  meta,
  expiryRequired,
  onDone,
  onNotice,
  mode,
}: {
  documentId: string;
  label: string;
  riderName: string;
  meta: string;
  expiryRequired: boolean;
  onDone: () => void;
  onNotice: (message: string) => void;
  mode: "review" | "countersign";
}) {
  const [view, setView] = useState<KycDocumentView | null>(null);
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
  const [rendered, setRendered] = useState(false);
  const [opening, setOpening] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<string>(REJECT_CODES[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [expiry, setExpiry] = useState("");

  const open = async () => {
    setOpening(true);
    setProblem(null);
    // A re-open is a new link and a new render; the old one may have expired.
    setRendered(false);
    try {
      const result = await api.viewKycDocument(documentId);
      setView(result ?? null);
      if (result && !result.renderable) {
        // Nothing will render, so nothing will set `rendered`. Say why, rather
        // than leaving the reviewer with a disabled Approve and no reason.
        setProblem(
          result.renditionError ??
            "This document is a PDF, so it downloads rather than opening here. " +
              "Open the downloaded file, then confirm below.",
        );
      }
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : "Could not open it.",
      );
    } finally {
      setOpening(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setProblem(null);
    try {
      const options =
        decision === "reject"
          ? { rejectCode: code, note: note || undefined }
          // Sent as the plain `YYYY-MM-DD` the input produces. Converting it to
          // an instant here would apply the *browser's* timezone, so a reviewer
          // on a laptop set to UTC would file a licence a day early. The server
          // reads a bare date as the end of that day in India, which is the one
          // place that decision belongs.
          : { expiresAt: expiryRequired ? expiry : undefined };

      const result =
        mode === "review"
          ? await api.reviewKycDocument(documentId, decision, options)
          : await api.countersignKycDocument(documentId, decision, options);

      // Raised to the page rather than shown on the card, because the card is
      // about to disappear — this is the one thing about the decision that
      // should outlive it. A partner whose claim differs from their own
      // document is worth a second look at their other papers, and nobody
      // would ever go and search the audit log for that.
      // Approving an identity document does not approve it.
      //
      // Aadhaar, PAN and driving licence need two signatures from two different
      // people (§4.10), so this decision moved the document to
      // `awaiting_second` — and the partner's app shows all three as still in
      // review, correctly, because from their side nothing has finished.
      //
      // The server has always returned this flag and nothing ever read it, so
      // the card simply vanished and the queue got shorter. An operator who has
      // just approved the last of a partner's documents, and then cannot
      // approve the partner, has no way to discover why. Saying it here is the
      // difference between a system that looks broken and one that is waiting.
      if (result?.awaitingSecondSignature) {
        onNotice(
          `${riderName}: ${label.toLowerCase()} approved, and now needs a ` +
            "second signature from a different admin before it counts. It is " +
            "in the Second signature tab — for them, not for you.",
        );
      }

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
      setProblem(
        caught instanceof ApiError ? caught.message : "Could not save that.",
      );
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>{label}</SectionLabel>
          <p className="font-medium">{riderName}</p>
          <p className="text-fg-faint text-sm">{meta}</p>
        </div>
        <GhostButton onClick={open} disabled={opening}>
          {opening ? "Opening…" : view ? "Reopen" : "View document"}
        </GhostButton>
      </div>

      {view?.renderable ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
              short-lived URL on the storage provider's host; next/image would
              try to proxy and optimise it, which fails once it expires. */}
          <img
            src={view.url}
            alt={`${label} for ${riderName}`}
            className="border-edge max-h-[28rem] w-auto rounded border"
            // The gate. Approve cannot unlock until this fires, and it fires
            // only when the browser has actually painted the document.
            onLoad={() => setRendered(true)}
            onError={() => {
              setRendered(false);
              setProblem(
                "The preview did not load. The link may have expired — reopen it.",
              );
            }}
          />
          <p className="text-fg-faint mt-2 text-xs">
            {/* The server's own number, not a sentence that happened to match
                it. This was hardcoded as "about two minutes" against a field
                the server never sent (A4). */}
            This link expires in {Math.round(view.expiresInSeconds / 60)} minute
            {view.expiresInSeconds >= 120 ? "s" : ""}.
          </p>
        </div>
      ) : view ? (
        <div className="mt-4">
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
              checked={rendered}
              onChange={(event) => setRendered(event.target.checked)}
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

      {problem ? <p className="text-warn mt-3 text-sm">{problem}</p> : null}

      {rejecting ? (
        <div className="mt-4 space-y-3">
          <select
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="border-edge bg-bg w-full rounded border px-3 py-2 text-sm"
          >
            {REJECT_CODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
            <Button onClick={() => decide("reject")} disabled={busy}>
              Confirm rejection
            </Button>
            <GhostButton onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </GhostButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {expiryRequired && rendered ? (
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

          <div className="flex gap-2">
            <Button
              onClick={() => decide("approve")}
              disabled={busy || !rendered || (expiryRequired && !expiry)}
            >
              {mode === "countersign" ? "Countersign" : "Approve"}
            </Button>
            <GhostButton onClick={() => setRejecting(true)} disabled={busy}>
              Reject
            </GhostButton>
            {!rendered ? (
              // Approving something you have not looked at is the failure this
              // whole screen exists to prevent, so the button stays disabled
              // until the document has actually been *rendered* — not merely
              // requested, which is all this used to check (A2).
              <span className="text-fg-faint self-center text-xs">
                {view
                  ? "Confirm you have read it before deciding"
                  : "Open the document before deciding"}
              </span>
            ) : expiryRequired && !expiry ? (
              <span className="text-fg-faint self-center text-xs">
                Enter the expiry date to approve
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Card>
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
    return <EmptyState title="No vehicles waiting" hint="Nothing to approve." />;
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
                  Third-party vehicle{item.ownerName ? ` · owner: ${item.ownerName}` : ""}
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

/** A short relative time. Absolute dates make a queue harder to triage. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

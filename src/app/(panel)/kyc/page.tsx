"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type KycQueueItem,
  type PageMeta,
  type PendingVehicle,
  api,
} from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

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
  const [queue, setQueue] = useState<KycQueueItem[] | null>(null);
  const [countersign, setCountersign] = useState<CountersignItem[] | null>(null);
  const [vehicles, setVehicles] = useState<PendingVehicle[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage, pageReady] = useUrlPage();
  const urlReady = tabReady && pageReady;
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response for an old tab landing after a newer one
  // and repainting the list with the wrong rows.
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setError(null);

    const fail = (caught: unknown) => {
      if (id !== requestId.current) return;
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not load the queue.",
      );
    };

    // One `page` and one `meta` across all three tabs, because only one queue
    // is on screen at a time. Per-tab paging state would let an operator return
    // to a tab and find themselves on page four of a queue they thought they
    // had left at the top.
    const took = <T,>(setter: (value: T[] | null) => void) =>
      (result: { results: T[]; page: PageMeta }) => {
        if (id !== requestId.current) return;
        if (result.page.beyondEnd) {
          setPage(0);
          return;
        }
        setter(result.results);
        setMeta(result.page);
      };

    if (tab === "review") {
      setQueue(null);
      api.kycQueue(page).then(took(setQueue)).catch(fail);
    } else if (tab === "countersign") {
      setCountersign(null);
      api.kycCountersignQueue(page).then(took(setCountersign)).catch(fail);
    } else {
      setVehicles(null);
      api.pendingVehicles(page).then(took(setVehicles)).catch(fail);
    }
  }, [tab, page, urlReady, setPage]);

  useEffect(load, [load]);

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

      {tab === "review" ? (
        <ReviewQueue items={queue} onDone={load} />
      ) : tab === "countersign" ? (
        <CountersignQueue items={countersign} onDone={load} />
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
}: {
  items: KycQueueItem[] | null;
  onDone: () => void;
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
          label={item.label}
          riderName={item.riderName}
          meta={`Uploaded ${formatWhen(item.uploadedAt)}`}
          onDone={onDone}
          mode="review"
        />
      ))}
    </div>
  );
}

function CountersignQueue({
  items,
  onDone,
}: {
  items: CountersignItem[] | null;
  onDone: () => void;
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
          label={item.label}
          riderName={item.riderName}
          meta={`First approved by ${item.firstReviewerName ?? "a colleague"} ${formatWhen(item.firstReviewedAt)}`}
          onDone={onDone}
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
  onDone,
  mode,
}: {
  documentId: string;
  label: string;
  riderName: string;
  meta: string;
  onDone: () => void;
  mode: "review" | "countersign";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<string>(REJECT_CODES[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    setOpening(true);
    setProblem(null);
    try {
      const result = await api.viewKycDocument(documentId);
      setUrl(result?.url ?? null);
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
        decision === "reject" ? { rejectCode: code, note: note || undefined } : {};
      if (mode === "review") {
        await api.reviewKycDocument(documentId, decision, options);
      } else {
        await api.countersignKycDocument(documentId, decision, options);
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
          {opening ? "Opening…" : url ? "Reopen" : "View document"}
        </GhostButton>
      </div>

      {url ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed,
              short-lived URL on the storage provider's host; next/image would
              try to proxy and optimise it, which fails once it expires. */}
          <img
            src={url}
            alt={`${label} for ${riderName}`}
            className="border-edge max-h-[28rem] w-auto rounded border"
          />
          <p className="text-fg-faint mt-2 text-xs">
            This link expires in about two minutes.
          </p>
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
        <div className="mt-4 flex gap-2">
          <Button onClick={() => decide("approve")} disabled={busy || !url}>
            {mode === "countersign" ? "Countersign" : "Approve"}
          </Button>
          <GhostButton onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </GhostButton>
          {!url ? (
            // Approving something you have not looked at is the failure this
            // whole screen exists to prevent, so the button stays disabled
            // until the document has actually been opened.
            <span className="text-fg-faint self-center text-xs">
              Open the document before deciding
            </span>
          ) : null}
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

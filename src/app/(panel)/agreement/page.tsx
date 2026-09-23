"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  GhostButton,
  Input,
  SectionLabel,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { ApiError, type Agreement, api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { diffLines, diffSummary } from "@/lib/textDiff";

/**
 * Publishing partner agreement terms.
 *
 * ## Why this screen is deliberately uncomfortable
 *
 * Publishing is irreversible and it stops work. Agreements are immutable by
 * design — a published version can never be edited or deleted, because
 * rewriting terms somebody already accepted would retroactively change what
 * they agreed to. And publishing takes every partner on the old version
 * offline until they re-accept, so it is also an operational event.
 *
 * Both of those are correct and neither is obvious from a form. So the screen
 * shows the current version, previews what is about to be published, and makes
 * the operator type the version number to confirm. That friction is the point.
 *
 * Owner-only, enforced by the API.
 */
export default function AgreementPage() {
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{
    version: string;
    ridersTakenOffline: number;
  } | null>(null);

  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  /**
   * Whether the operator has opened the comparison against the terms in force.
   *
   * A gate, not a record: Publish stays disabled until it has been opened, the
   * same shape as the verification screen's "the document has to have
   * rendered". Typing the version number was the only guard, and the version
   * number is in a field four inches above the box asking for it — which makes
   * it a transcription exercise rather than a decision. What is actually worth
   * confirming is the text, and the text was nowhere on the page.
   */
  const [diffOpen, setDiffOpen] = useState(false);

  const {
    data: current,
    error: loadError,
    loading,
    reload: load,
  } = useAsync<Agreement>(
    async () => {
      try {
        return await api.currentAgreement();
      } catch (caught) {
        // A 404 means nothing has been published yet, which is a legitimate
        // starting state rather than a failure — `null` is "nothing to show",
        // which is exactly what this is.
        if (caught instanceof ApiError && caught.status === 404) return null;
        throw caught;
      }
    },
    [],
    { fallback: "Could not load the current agreement." },
  );

  /*
   * Who is working right now, which is who this would stop.
   *
   * Its own request rather than a field on the agreement, so it can be
   * refreshed against the moment of the decision. A figure fetched when the
   * page opened and confirmed against an hour later is worse than none: it
   * reads as current and is not.
   */
  const { data: impact, reload: reloadImpact } = useAsync(
    () => api.agreementImpact(),
    [],
    { fallback: "Could not count who is online." },
  );

  const scheduled = effectiveFrom.trim() !== "";
  const diff = useMemo(
    () => diffLines(current?.body ?? "", body),
    [current?.body, body],
  );
  const changes = useMemo(() => diffSummary(diff), [diff]);

  // A refused publish is not a failed load, and the two used to overwrite each
  // other: publishing reloads, and the reload cleared the message saying why
  // the publish had been refused before the operator could read it.
  const [publishError, setPublishError] = useState<string | null>(null);
  const error = loadError ?? publishError;

  // Typing the version number back is the confirmation. A checkbox is too easy
  // to tick past for something that cannot be undone.
  const confirmed = confirm.trim() !== "" && confirm.trim() === version.trim();
  const ready =
    version.trim() !== "" &&
    title.trim() !== "" &&
    // Mirrors the server's minimum. A 200-character "agreement" is a mistake,
    // not terms.
    body.trim().length >= 200 &&
    confirmed &&
    // Nothing is published that has not been compared with what it replaces.
    diffOpen &&
    !publishing;

  const publish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const published = await api.publishAgreement({
        version: version.trim(),
        title: title.trim(),
        body,
        // Sent only when one was chosen. An empty string would fail ISO
        // validation, and sending "now" explicitly would differ from omitting
        // it the moment the request is slow.
        ...(scheduled
          ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
          : {}),
      });
      setResult({
        version: published.version,
        ridersTakenOffline: published.ridersTakenOffline,
      });
      setVersion("");
      setTitle("");
      setBody("");
      setConfirm("");
      setEffectiveFrom("");
      setDiffOpen(false);
      load();
      reloadImpact();
    } catch (caught) {
      setPublishError(
        caught instanceof ApiError ? caught.message : "Could not publish.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner agreement"
        subtitle="The contract every delivery partner accepts. Published versions cannot be edited or removed — new terms are a new version."
      />

      {result ? (
        <Card>
          <p className="text-ok font-medium">Published {result.version}</p>
          <p className="text-fg-faint mt-1 text-sm">
            {result.ridersTakenOffline === 0
              ? "No partners were on duty, so nobody was taken offline."
              : `${result.ridersTakenOffline} partner${result.ridersTakenOffline === 1 ? " was" : "s were"} taken offline and must accept the new terms before working again.`}
          </p>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <p className="text-warn text-sm">{error}</p>
        </Card>
      ) : null}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <Card>
          <SectionLabel>Currently in force</SectionLabel>
          {current ? (
            <div className="mt-2 space-y-2">
              <p className="font-medium">
                {current.title}{" "}
                <span className="text-fg-faint font-mono text-sm">
                  {current.version}
                </span>
              </p>
              <p className="text-fg-faint text-xs">
                Effective {new Date(current.effectiveFrom).toLocaleDateString()}{" "}
                · sha256 {current.contentHash.slice(0, 16)}…
              </p>
              <details>
                <summary className="cursor-pointer text-sm">
                  Read the text
                </summary>
                <pre className="border-edge bg-bg mt-2 max-h-80 overflow-auto rounded border p-3 text-xs whitespace-pre-wrap">
                  {current.body}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-warn mt-2 text-sm">
              Nothing published. Partners cannot be dispatched work until an
              agreement exists.
            </p>
          )}
        </Card>
      )}

      <Card>
        <SectionLabel>Publish new terms</SectionLabel>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="text-fg-faint mb-1 block text-xs"
                htmlFor="version"
              >
                Version
              </label>
              <Input
                id="version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="2.0"
              />
            </div>
            <div>
              <label
                className="text-fg-faint mb-1 block text-xs"
                htmlFor="title"
              >
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Mioryde Delivery Partner Agreement"
              />
            </div>
          </div>

          <div>
            <label className="text-fg-faint mb-1 block text-xs" htmlFor="body">
              Full text{" "}
              <span className="font-mono">
                ({body.trim().length} characters)
              </span>
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={14}
              placeholder="Paste the complete counsel-drafted agreement. This exact text is what partners see and what a dispute is judged against."
              className="border-edge bg-bg w-full rounded border px-3 py-2 font-mono text-xs"
            />
            {body.trim().length > 0 && body.trim().length < 200 ? (
              <p className="text-warn mt-1 text-xs">
                Too short — the server requires at least 200 characters.
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="text-fg-faint mb-1 block text-xs"
              htmlFor="effective-from"
            >
              Take effect (optional — leave blank for immediately)
            </label>
            <input
              id="effective-from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className="border-edge bg-bg rounded border px-3 py-2 font-mono text-xs"
            />
            <p className="text-fg-faint mt-1 text-xs">
              {/* The server has accepted `effectiveFrom` all along and this
                  panel never sent it, so the only way to publish was to do it
                  now — mid-shift, with the fleet on the road. */}
              {scheduled
                ? "Scheduled. Nobody is taken offline until then, and the version is still permanent from the moment it is created."
                : "Immediate. Everyone working right now stops until they accept."}
            </p>
          </div>

          <div className="border-edge rounded border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                Compare with{" "}
                {current ? `version ${current.version}` : "nothing published"}
              </p>
              <GhostButton onClick={() => setDiffOpen((open) => !open)}>
                {diffOpen ? "Hide comparison" : "Review the changes"}
              </GhostButton>
            </div>
            <p className="text-fg-faint mt-1 text-xs">
              {body.trim().length === 0
                ? "Paste the new text to compare it."
                : `${changes.added} lines added · ${changes.removed} removed · ${changes.unchanged} unchanged.`}
            </p>
            {diffOpen ? (
              <pre className="border-edge bg-bg mt-2 max-h-80 overflow-auto rounded border p-2 font-mono text-[11px] leading-relaxed">
                {diff.map((line, index) => (
                  <div
                    key={index}
                    className={
                      line.kind === "added"
                        ? "text-ok"
                        : line.kind === "removed"
                          ? "text-danger line-through"
                          : "text-fg-faint"
                    }
                  >
                    {line.kind === "added"
                      ? "+ "
                      : line.kind === "removed"
                        ? "- "
                        : "  "}
                    {line.text || " "}
                  </div>
                ))}
              </pre>
            ) : null}
          </div>

          <div className="border-warn/40 bg-warn/5 rounded border p-3">
            <p className="text-sm font-medium">This cannot be undone.</p>

            {/* The blast radius, before it is the blast radius. The publish
                response already reported this number; saying it afterwards is
                not information, it is a receipt. */}
            <p className="mt-2 text-sm">
              {impact === null || impact === undefined ? (
                <span className="text-fg-faint">Counting who is online…</span>
              ) : scheduled ? (
                <>
                  Nobody is taken offline now. At the scheduled time, whoever is
                  working — currently {impact.onlineNow} of{" "}
                  {impact.activePartners} active partners — stops until they
                  accept.
                </>
              ) : (
                <>
                  <strong>
                    {impact.onlineNow} of {impact.activePartners} active
                    partners
                  </strong>{" "}
                  are working right now and will be taken offline immediately.
                </>
              )}
            </p>
            <ul className="text-fg-faint mt-2 space-y-1 text-sm">
              <li>
                • The version is permanent. It can never be edited or deleted —
                a correction means publishing another version.
              </li>
              <li>
                • Every partner still on the previous version is taken offline
                immediately and cannot work until they accept.
              </li>
              <li>
                • The text below is stored exactly as typed and hashed. It is
                what a dispute is judged against.
              </li>
            </ul>

            <div className="mt-3">
              <label
                className="text-fg-faint mb-1 block text-xs"
                htmlFor="confirm"
              >
                Type the version number to confirm
              </label>
              <Input
                id="confirm"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder={version.trim() || "version"}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={publish} disabled={!ready}>
              {publishing ? "Publishing…" : "Publish these terms"}
            </Button>
            {!diffOpen && body.trim().length >= 200 ? (
              <p className="text-fg-faint self-center text-xs">
                Review the changes first.
              </p>
            ) : null}
            {version || title || body || confirm ? (
              <GhostButton
                onClick={() => {
                  setVersion("");
                  setTitle("");
                  setBody("");
                  setConfirm("");
                  setEffectiveFrom("");
                  setDiffOpen(false);
                }}
                disabled={publishing}
              >
                Clear
              </GhostButton>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

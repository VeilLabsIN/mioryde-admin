"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  GhostButton,
  Input,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { ApiError, type Agreement, api } from "@/lib/api";

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
  const [current, setCurrent] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{
    version: string;
    ridersTakenOffline: number;
  } | null>(null);

  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState("");

  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    api
      .currentAgreement()
      .then((agreement) => {
        if (id === requestId.current) setCurrent(agreement);
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        // A 404 means nothing has been published yet, which is a legitimate
        // starting state rather than a failure.
        if (caught instanceof ApiError && caught.status === 404) {
          setCurrent(null);
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load the current agreement.",
        );
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

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
    !publishing;

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const published = await api.publishAgreement({
        version: version.trim(),
        title: title.trim(),
        body,
      });
      setResult({
        version: published.version,
        ridersTakenOffline: published.ridersTakenOffline,
      });
      setVersion("");
      setTitle("");
      setBody("");
      setConfirm("");
      load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not publish.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Partner agreement</h1>
        <p className="text-fg-faint mt-1 text-sm">
          The contract every delivery partner accepts. Published versions cannot
          be edited or removed — new terms are a new version.
        </p>
      </div>

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
              <label className="text-fg-faint mb-1 block text-xs" htmlFor="version">
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
              <label className="text-fg-faint mb-1 block text-xs" htmlFor="title">
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
              <span className="font-mono">({body.trim().length} characters)</span>
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

          <div className="border-warn/40 bg-warn/5 rounded border p-3">
            <p className="text-sm font-medium">This cannot be undone.</p>
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
              <label className="text-fg-faint mb-1 block text-xs" htmlFor="confirm">
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
            {version || title || body || confirm ? (
              <GhostButton
                onClick={() => {
                  setVersion("");
                  setTitle("");
                  setBody("");
                  setConfirm("");
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

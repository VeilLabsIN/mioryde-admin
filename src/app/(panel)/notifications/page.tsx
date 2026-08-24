"use client";

import { useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  Input,
  PageHeader,
  SkeletonRows,
} from "@/components/ui";
import { ApiError, type NotificationTopic, api } from "@/lib/api";

/**
 * Which notifications the product sends.
 *
 * ## What this is for
 *
 * One thing, and it is worth being narrow about it: switching a message off
 * when it is going out wrong. That happens during an incident, at speed, by
 * whoever is watching — so every row says **who receives it** and **what
 * breaks if you switch it off**, because "disable order.assigned" is not a
 * decision anybody can make and "stop telling customers a partner is on the
 * way" is.
 *
 * ## What it deliberately is not
 *
 * There is no toggle for OTP. Those are a sign-in mechanism rather than a
 * notification, and a control that could lock every user out of the product
 * has no business on a screen where somebody is clicking quickly.
 *
 * There is also no email management here, because **the product sends no
 * email at all** — no SMTP, no provider, no credentials. A page offering to
 * add and remove recipients for messages that cannot be sent would be worse
 * than its absence: it would read as configured.
 */
export default function NotificationsPage() {
  const [topics, setTopics] = useState<NotificationTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .notificationTopics()
      .then((data) => {
        if (!cancelled) setTopics(data.topics);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Could not load notifications.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const off = topics?.filter((t) => !t.enabled).length ?? 0;

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Notifications"
        subtitle={
          topics === null
            ? "Loading…"
            : off === 0
              ? "Everything the product sends is switched on."
              : `${off} switched off — customers or partners are not being told.`
        }
      />

      {error ? (
        <EmptyState title="Could not load notifications" hint={error} />
      ) : topics === null ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {topics.map((topic) => (
            <TopicRow
              key={topic.topic}
              topic={topic}
              onChanged={(next) =>
                setTopics((current) =>
                  (current ?? []).map((t) =>
                    t.topic === next.topic ? next : t,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      <p className="text-fg-faint text-meta mt-6 leading-relaxed">
        These control push notifications only. Sign-in codes are not a
        notification and cannot be switched off here. Every change is recorded
        in the audit log with your name against it.
      </p>
    </div>
  );
}

function TopicRow({
  topic,
  onChanged,
}: {
  topic: NotificationTopic;
  onChanged: (next: NotificationTopic) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only asked for when switching *off*. Turning something back on needs no
  // justification; turning it off is the thing somebody has to explain later.
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function apply(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.setNotificationTopic(topic.topic, {
        enabled,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onChanged({
        ...topic,
        enabled,
        note: note.trim() || null,
        updatedAt: new Date().toISOString(),
      });
      setConfirming(false);
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      size="lg"
      // The off state is marked on the card itself, not only in the label. A
      // page of near-identical rows is one where a single disabled item is
      // genuinely easy to miss, and missing it is the failure mode — somebody
      // switched something off during an incident and nobody turned it back on.
      className={`p-4 ${topic.enabled ? "" : "border-warn/50"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-label text-fg font-medium">{topic.label}</h2>
            <span
              className={`border px-1.5 py-0.5 font-mono text-micro uppercase ${
                topic.audience === "partner"
                  ? "border-accent/40 text-accent"
                  : "border-edge text-fg-muted"
              }`}
            >
              {topic.audience === "partner" ? "Partners" : "Customers"}
            </span>
            {!topic.enabled && (
              <span className="border-warn/40 text-warn border px-1.5 py-0.5 font-mono text-micro uppercase">
                Off
              </span>
            )}
          </div>

          <p className="text-body text-fg-soft mt-1">{topic.detail}</p>

          {topic.warning ? (
            <p className="text-fg-muted text-meta mt-1.5">{topic.warning}</p>
          ) : null}

          {!topic.enabled && topic.note ? (
            // The reason it is off, shown where somebody deciding whether to
            // turn it back on will see it.
            <p className="text-warn text-meta mt-1.5">Reason: {topic.note}</p>
          ) : null}

          {topic.updatedBy ? (
            <p className="text-fg-faint text-meta mt-1">
              Last changed by {topic.updatedBy}
              {topic.updatedAt
                ? ` · ${new Date(topic.updatedAt).toLocaleString("en-IN")}`
                : ""}
            </p>
          ) : null}

          <p className="text-fg-faint font-mono text-micro mt-1">
            {topic.topic}
          </p>
        </div>

        <div className="shrink-0">
          {topic.enabled ? (
            <GhostButton
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="border-warn/50 text-warn hover:border-warn"
            >
              Switch off
            </GhostButton>
          ) : (
            <GhostButton
              onClick={() => apply(true)}
              disabled={busy}
              className="border-ok/50 text-ok hover:border-ok"
            >
              Switch on
            </GhostButton>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="border-line mt-3 flex flex-col gap-2 border-t pt-3">
          <p className="text-body text-fg-soft">
            {topic.audience === "partner" ? "Partners" : "Customers"} will stop
            receiving this. Say why, so the next person knows whether to turn it
            back on.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. duplicate pushes during the 24 Aug incident"
              className="min-w-[240px] flex-1"
              aria-label="Reason for switching off"
            />
            <GhostButton
              onClick={() => apply(false)}
              disabled={busy}
              className="border-warn/50 text-warn hover:border-warn"
            >
              {busy ? "Saving…" : "Switch off"}
            </GhostButton>
            <GhostButton onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </GhostButton>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-warn text-meta mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

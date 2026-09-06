"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Input,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { ApiError, type RuntimeSetting, api } from "@/lib/api";

/**
 * What the platform is doing right now, and the controls that change it.
 *
 * ## Why this is not the Settings page
 *
 * `/settings` reads the environment the process booted with. Nothing on it can
 * be changed without a redeploy, and it exists to answer "why is it behaving
 * like this". This page is the opposite: every value is a database row, and
 * changing one takes effect within ten seconds without restarting anything.
 *
 * That distinction is the whole reason the table exists. The API runs on a
 * single Render instance, where an environment-variable change is a restart and
 * a restart drops the location heartbeat of every partner mid-delivery. A
 * control whose entire value is being reachable during an incident cannot be
 * one that causes an outage to use.
 *
 * ## Why rows are drawn read-only rather than hidden
 *
 * The server decides per row, per role, and returns `editable`. Operations can
 * see the model chain but not set it; a developer can see the ordering kill
 * switch but not throw it. Both need to *read* the other's settings during an
 * incident — "is ordering paused?" is the first question asked when deliveries
 * stop — and a row that disappears for one role reads as a broken page rather
 * than as a policy.
 *
 * The panel does not re-derive who may edit what. That map lives in the API
 * beside the routes it guards, and a second copy here is exactly the drift
 * `permissions.ts` warns about.
 */
export default function PlatformPage() {
  const [settings, setSettings] = useState<RuntimeSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .runtimeSettings()
      .then((d) => setSettings(d.settings))
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError ? e.message : "Could not load platform settings.",
        ),
      );
  }, []);

  useEffect(load, [load]);

  const byKey = (k: string) => settings?.find((s) => s.key === k);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform"
        subtitle="Changes here take effect within ten seconds. Nothing restarts."
      />

      {error ? (
        <Card className="p-4 text-body text-fg-muted">{error}</Card>
      ) : null}

      {!settings && !error ? <SkeletonRows rows={4} /> : null}

      {settings ? (
        <>
          <section className="space-y-3">
            <SectionLabel>Assistant</SectionLabel>
            <ModelChain setting={byKey("wuda.models")} onSaved={load} />
            <BooleanSetting setting={byKey("wuda.enabled")} onSaved={load} />
          </section>

          <section className="space-y-3">
            <SectionLabel>Service status</SectionLabel>
            <MaintenanceSetting setting={byKey("maintenance")} onSaved={load} />
            <OrderingSetting setting={byKey("ordering.paused")} onSaved={load} />
          </section>

          {/*
            Its own section rather than sitting under Service status, because
            it is not a status: nothing is degraded either way, and putting a
            reversible delivery experiment next to the kill switch invites
            somebody to read the two as the same kind of lever.
          */}
          <section className="space-y-3">
            <SectionLabel>Notifications</SectionLabel>
            <BooleanSetting setting={byKey("push.dataOnly")} onSaved={load} />
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Shared chrome: title, description, who changed it last, and the save state. */
function SettingCard({
  setting,
  children,
  onSave,
  dirty,
}: {
  setting: RuntimeSetting;
  children: React.ReactNode;
  onSave: () => Promise<void>;
  dirty: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-sans text-body font-semibold">{setting.label}</h2>
        <p className="text-caption text-fg-muted">{setting.description}</p>
      </div>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-fg-muted">
          {!setting.editable
            ? `Read-only for your role — changed by ${setting.roles.join(" or ")}.`
            : setting.isDefault
              ? "Never changed. Running the built-in default."
              : `Last changed by ${setting.updatedBy ?? "an earlier version"}${
                  setting.updatedAt
                    ? ` on ${new Date(setting.updatedAt).toLocaleString()}`
                    : ""
                }.`}
          {setting.note ? ` — “${setting.note}”` : ""}
        </p>

        {setting.editable ? (
          <Button
            loading={saving}
            disabled={!dirty}
            onClick={async () => {
              setSaving(true);
              setMessage(null);
              try {
                await onSave();
                setMessage("Saved.");
              } catch (e: unknown) {
                // The server's message is the useful one — it names the field
                // that failed, or the roles that may change this. A generic
                // "could not save" would throw that away.
                setMessage(
                  e instanceof ApiError ? e.message : "Could not save.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className="text-caption text-fg-muted">{message}</p>
      ) : null}
    </Card>
  );
}

/**
 * The model chain, one per line.
 *
 * A free-text list rather than a dropdown of known models, deliberately.
 * OpenRouter carries hundreds and retires them on their own schedule; a
 * hard-coded list would be stale within a month and would need a panel release
 * to add the model that replaced the one that went away — which is the exact
 * redeploy this whole mechanism exists to avoid.
 *
 * The server validates the shape (a non-empty array of non-empty strings) and
 * nothing validates that a name exists, because only OpenRouter knows. A typo
 * therefore surfaces as WUDA degrading to retrieval and saying so, which is the
 * same visible behaviour as the vendor being down and is handled the same way.
 */
function ModelChain({
  setting,
  onSaved,
}: {
  setting: RuntimeSetting | undefined;
  onSaved: () => void;
}) {
  const initial = Array.isArray(setting?.value)
    ? (setting.value as string[]).join("\n")
    : "";
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);

  if (!setting) return null;

  const models = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <SettingCard
      setting={setting}
      dirty={text !== initial}
      onSave={async () => {
        await api.setRuntimeSetting(setting.key, { value: models });
        onSaved();
      }}
    >
      <textarea
        value={text}
        readOnly={!setting.editable}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full rounded-md border border-line bg-bg-inset p-3 font-mono text-caption
                   text-fg outline-none focus:border-accent disabled:opacity-60"
      />
    </SettingCard>
  );
}

function BooleanSetting({
  setting,
  onSaved,
}: {
  setting: RuntimeSetting | undefined;
  onSaved: () => void;
}) {
  const initial = setting?.value === true;
  const [on, setOn] = useState(initial);
  useEffect(() => setOn(initial), [initial]);

  if (!setting) return null;

  return (
    <SettingCard
      setting={setting}
      dirty={on !== initial}
      onSave={async () => {
        await api.setRuntimeSetting(setting.key, { value: on });
        onSaved();
      }}
    >
      <label className="flex items-center gap-3 text-body">
        <input
          type="checkbox"
          checked={on}
          disabled={!setting.editable}
          onChange={(e) => setOn(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {on ? "On" : "Off"}
      </label>
    </SettingCard>
  );
}

interface Maintenance {
  active: boolean;
  severity: "info" | "warning" | "blocking";
  title: string | null;
  body: string | null;
  startsAt: string | null;
  endsAt: string | null;
  blockWrites: boolean;
}

/**
 * The maintenance notice both apps show.
 *
 * Carried on `GET /v1/app-version`, which both apps already call at launch
 * before they have a session — so a notice reaches a customer whose token has
 * expired and a partner who has not signed in, which is precisely who needs to
 * be told the service is down.
 */
function MaintenanceSetting({
  setting,
  onSaved,
}: {
  setting: RuntimeSetting | undefined;
  onSaved: () => void;
}) {
  const initial = setting?.value as Maintenance | undefined;
  const [draft, setDraft] = useState<Maintenance | undefined>(initial);
  useEffect(() => setDraft(initial), [initial]);

  if (!setting || !draft || !initial) return null;

  const set = (patch: Partial<Maintenance>) =>
    setDraft({ ...draft, ...patch });

  return (
    <SettingCard
      setting={setting}
      dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onSave={async () => {
        await api.setRuntimeSetting(setting.key, { value: draft });
        onSaved();
      }}
    >
      <div className="space-y-3">
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={draft.active}
            disabled={!setting.editable}
            onChange={(e) => set({ active: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          Show this notice in both apps
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-caption text-fg-muted">Severity</span>
            <select
              value={draft.severity}
              disabled={!setting.editable}
              onChange={(e) =>
                set({ severity: e.target.value as Maintenance["severity"] })
              }
              className="h-10 w-full rounded-md border border-line bg-bg-inset px-3 text-body
                         text-fg outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="info">Info — a dismissible note</option>
              <option value="warning">Warning — dismissible, louder</option>
              <option value="blocking">Blocking — full screen</option>
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-caption text-fg-muted">Title</span>
            <Input
              value={draft.title ?? ""}
              disabled={!setting.editable}
              onChange={(e) => set({ title: e.target.value || null })}
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-caption text-fg-muted">Message</span>
          <textarea
            value={draft.body ?? ""}
            readOnly={!setting.editable}
            onChange={(e) => set({ body: e.target.value || null })}
            rows={3}
            className="w-full rounded-md border border-line bg-bg-inset p-3 text-body
                       text-fg outline-none focus:border-accent disabled:opacity-60"
          />
        </label>

        <label className="flex items-start gap-3 text-body">
          <input
            type="checkbox"
            checked={draft.blockWrites}
            disabled={!setting.editable}
            onChange={(e) => set({ blockWrites: e.target.checked })}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            Refuse new work while this is on
            <span className="block text-caption text-fg-muted">
              Reads keep serving, and a delivery already in flight can still be
              tracked and completed. Placing a new order cannot.
            </span>
          </span>
        </label>
      </div>
    </SettingCard>
  );
}

interface Ordering {
  paused: boolean;
  zones: string[];
  message: string | null;
}

/**
 * The kill switch.
 *
 * For a flood, a riot, or a dispatch bug offering the same delivery to the
 * whole city. It stops the platform accepting new orders without a deploy and
 * without a developer, which is the point: the people awake when this is needed
 * are on the operations team.
 */
function OrderingSetting({
  setting,
  onSaved,
}: {
  setting: RuntimeSetting | undefined;
  onSaved: () => void;
}) {
  const initial = setting?.value as Ordering | undefined;
  const [draft, setDraft] = useState<Ordering | undefined>(initial);
  useEffect(() => setDraft(initial), [initial]);

  if (!setting || !draft || !initial) return null;

  return (
    <SettingCard
      setting={setting}
      dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
      onSave={async () => {
        await api.setRuntimeSetting(setting.key, { value: draft });
        onSaved();
      }}
    >
      <div className="space-y-3">
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={draft.paused}
            disabled={!setting.editable}
            onChange={(e) => setDraft({ ...draft, paused: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          {draft.paused ? "Not accepting new orders" : "Accepting orders"}
        </label>

        <label className="space-y-1 block">
          <span className="text-caption text-fg-muted">
            What customers are told
          </span>
          <Input
            value={draft.message ?? ""}
            disabled={!setting.editable}
            onChange={(e) =>
              setDraft({ ...draft, message: e.target.value || null })
            }
          />
        </label>

        <p className="text-caption text-fg-muted">
          Applies everywhere. Per-zone pausing is stored but not yet offered
          here — the zone picker is the next piece of work on this page, and
          shipping a control that silently ignores half its input would be worse
          than its absence.
        </p>
      </div>
    </SettingCard>
  );
}

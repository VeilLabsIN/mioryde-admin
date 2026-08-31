"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  GhostButton,
  Input,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import {
  ApiError,
  type Banner,
  type BannerAudience,
  type BannerInput,
  type BannerTone,
  api,
  bannerState,
} from "@/lib/api";

/**
 * In-app messages to customers and partners.
 *
 * ## What this page is
 *
 * The only way to put words on somebody's home screen. That is a lot of reach
 * for a form, so the page is built to make the reach visible rather than to
 * make writing fast: the audience is chosen first and never changes, the
 * preview shows the actual card the app will draw, and the live ones are
 * listed above the drafts so you cannot forget what is already out there.
 *
 * ## Why there is no rich text, no image and no colour picker
 *
 * The apps decide how a banner looks; this decides what it says. A remotely
 * styled surface is a remote-code surface — an app that renders whatever the
 * server sends can be made to say anything by whoever reaches this form, and
 * "your account is suspended" in the app's error red is a support call from a
 * driver whose account is fine. Tone is a closed set of three.
 *
 * ## Why "remove" does not delete
 *
 * It sets the end time to now. The banner leaves every screen within one
 * refresh and the record of what was said, and when, survives — which is the
 * first thing anybody asks after a message goes out wrong.
 */
export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<BannerAudience | null>(null);

  async function reload() {
    try {
      const data = await api.banners();
      setBanners(data.results);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load banners.");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const grouped = useMemo(() => {
    const all = banners ?? [];
    return {
      customer: all.filter((b) => b.audience === "customer"),
      partner: all.filter((b) => b.audience === "partner"),
    };
  }, [banners]);

  const liveCount = (banners ?? []).filter(
    (b) => bannerState(b) === "live",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="In-app banners"
        subtitle={
          banners === null
            ? undefined
            : `${banners.length} total · ${liveCount} showing now`
        }
      />

      {error ? (
        <Card tone="warning" className="p-4">
          <p className="text-body">{error}</p>
        </Card>
      ) : null}

      {banners === null ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          <AudienceSection
            audience="customer"
            heading="Customers"
            note="Shown on the customer app home screen, under the booking card."
            banners={grouped.customer}
            composing={composing === "customer"}
            onCompose={() => setComposing("customer")}
            onCancel={() => setComposing(null)}
            onChanged={() => {
              setComposing(null);
              void reload();
            }}
          />

          <AudienceSection
            audience="partner"
            heading="Delivery partners"
            note="Shown on the partner app Work screen, below today's earnings."
            banners={grouped.partner}
            composing={composing === "partner"}
            onCompose={() => setComposing("partner")}
            onCancel={() => setComposing(null)}
            onChanged={() => {
              setComposing(null);
              void reload();
            }}
          />
        </>
      )}
    </div>
  );
}

function AudienceSection({
  audience,
  heading,
  note,
  banners,
  composing,
  onCompose,
  onCancel,
  onChanged,
}: {
  audience: BannerAudience;
  heading: string;
  note: string;
  banners: Banner[];
  composing: boolean;
  onCompose: () => void;
  onCancel: () => void;
  onChanged: () => void;
}) {
  // Live first, then scheduled, then ended. An operator opening this page is
  // asking "what is out there now"; the history is context, not the answer.
  const order = { live: 0, scheduled: 1, ended: 2 } as const;
  const sorted = [...banners].sort(
    (a, b) => order[bannerState(a)] - order[bannerState(b)],
  );

  return (
    <Card size="lg" className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>{heading}</SectionLabel>
          <p className="mt-1 text-body-sm text-fg-muted">{note}</p>
        </div>
        {composing ? null : (
          <GhostButton onClick={onCompose}>New banner</GhostButton>
        )}
      </div>

      {composing ? (
        <Composer audience={audience} onCancel={onCancel} onSaved={onChanged} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          hint="This audience sees no banner at the moment."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((b) => (
            <li key={b.id}>
              <BannerRow banner={b} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BannerRow({
  banner,
  onChanged,
}: {
  banner: Banner;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = bannerState(banner);

  async function retire() {
    setBusy(true);
    try {
      await api.retireBanner(banner.id);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove it.");
      setBusy(false);
    }
  }

  return (
    <Card tone="inset" className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <StatePill state={state} />
            <TonePill tone={banner.tone} />
            {!banner.dismissible ? (
              <span className="text-body-sm text-fg-muted">
                cannot be dismissed
              </span>
            ) : null}
          </div>
          <p className="font-sans text-body font-semibold">{banner.title}</p>
          <p className="text-body-sm text-fg-muted">{banner.body}</p>
          <p className="mt-1 text-body-sm text-fg-faint">
            {windowText(banner)}
            {banner.actionLabel ? ` · ${banner.actionLabel} → ${banner.actionRoute}` : ""}
          </p>
          {error ? (
            <p className="mt-1 text-body-sm text-danger">{error}</p>
          ) : null}
        </div>
        {state === "ended" ? null : (
          <GhostButton onClick={() => void retire()} disabled={busy}>
            {busy ? "Removing…" : "Remove"}
          </GhostButton>
        )}
      </div>
    </Card>
  );
}

/** "from 3 Sep, until 7 Sep" — dates a person reads, not ISO strings. */
function windowText(b: Banner): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return b.endsAt === null
    ? `from ${fmt(b.startsAt)}, no end date`
    : `${fmt(b.startsAt)} → ${fmt(b.endsAt)}`;
}

function StatePill({ state }: { state: "live" | "scheduled" | "ended" }) {
  const tone =
    state === "live"
      ? "bg-success/15 text-success"
      : state === "scheduled"
        ? "bg-accent/15 text-accent"
        : "bg-panel text-fg-faint";
  return (
    <span className={`rounded-xs px-2 py-0.5 text-body-sm ${tone}`}>
      {state}
    </span>
  );
}

function TonePill({ tone }: { tone: BannerTone }) {
  return (
    <span className="rounded-xs bg-panel px-2 py-0.5 text-body-sm text-fg-muted">
      {tone}
    </span>
  );
}

/**
 * The compose form, with the app's own card rendered beside it.
 *
 * The preview is not decoration. Title and body are capped at 60 and 160
 * characters because that is what fits the card in the app, and a form that
 * accepts what the app will then clip is a form that produces banners reading
 * "Complete 4 trips between 6pm and 10pm for an extra…".
 */
function Composer({
  audience,
  onCancel,
  onSaved,
}: {
  audience: BannerAudience;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BannerInput>({
    audience,
    title: "",
    body: "",
    tone: "neutral",
    dismissible: true,
    priority: 100,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleLeft = 60 - form.title.length;
  const bodyLeft = 160 - form.body.length;
  const valid =
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    titleLeft >= 0 &&
    bodyLeft >= 0 &&
    // Both or neither. The server enforces this too; saying so here saves a
    // round trip and an error message that arrives after the work.
    Boolean(form.actionLabel) === Boolean(form.actionRoute);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.createBanner({
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save it.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label="Title" hint={`${titleLeft} left`} over={titleLeft < 0}>
          <Input
            value={form.title}
            maxLength={80}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Evening bonus is live"
          />
        </Field>

        <Field label="Message" hint={`${bodyLeft} left`} over={bodyLeft < 0}>
          <Input
            value={form.body}
            maxLength={200}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Complete 4 trips between 6pm and 10pm for an extra 200."
          />
        </Field>

        <Field label="Tone">
          <div className="flex gap-2">
            {(["neutral", "reward", "warning"] as BannerTone[]).map((t) => (
              <GhostButton
                key={t}
                onClick={() => setForm({ ...form, tone: t })}
                className={form.tone === t ? "border-accent text-accent" : ""}
              >
                {t}
              </GhostButton>
            ))}
          </div>
        </Field>

        <Field
          label="Action (optional)"
          hint="An in-app path such as /bank. Never a web address."
        >
          <div className="flex gap-2">
            <Input
              value={form.actionLabel ?? ""}
              maxLength={24}
              onChange={(e) =>
                setForm({ ...form, actionLabel: e.target.value || undefined })
              }
              placeholder="Add account"
            />
            <Input
              value={form.actionRoute ?? ""}
              onChange={(e) =>
                setForm({ ...form, actionRoute: e.target.value || undefined })
              }
              placeholder="/bank"
            />
          </div>
        </Field>

        <Field label="Ends (optional)" hint="Leave empty to run until removed.">
          <Input
            type="datetime-local"
            value={form.endsAt ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                endsAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
              })
            }
          />
        </Field>

        {error ? <p className="text-body-sm text-danger">{error}</p> : null}

        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!valid || busy}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
          <GhostButton onClick={onCancel} disabled={busy}>
            Cancel
          </GhostButton>
        </div>
      </div>

      <div>
        <SectionLabel>What they will see</SectionLabel>
        <div className="mt-2">
          <Preview
            title={form.title || "Title"}
            body={form.body || "Message"}
            tone={form.tone ?? "neutral"}
            actionLabel={form.actionLabel ?? null}
            dismissible={form.dismissible ?? true}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  over = false,
  children,
}: {
  label: string;
  hint?: string;
  over?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm text-fg-muted">{label}</span>
        {hint ? (
          <span
            className={`text-body-sm ${over ? "text-danger" : "text-fg-faint"}`}
          >
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

/**
 * The card as the apps draw it: cut corner, tone rule, dismiss control.
 *
 * Approximated in CSS rather than shared with the apps, which is a real
 * duplication and the honest trade — the alternative is a design-token pipeline
 * between a Flutter app and a Next.js panel for one component. The shape and
 * the two-line clamp are what matter, and those are what this copies.
 */
function Preview({
  title,
  body,
  tone,
  actionLabel,
  dismissible,
}: {
  title: string;
  body: string;
  tone: BannerTone;
  actionLabel: string | null;
  dismissible: boolean;
}) {
  const rule =
    tone === "reward"
      ? "bg-success"
      : tone === "warning"
        ? "bg-accent"
        : "bg-fg-faint";

  return (
    <div
      className="flex gap-3 border border-edge bg-[#111] p-4 text-[#f5f5f5]"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 78%, 92% 100%, 0 100%)" }}
    >
      <div className={`w-[3px] shrink-0 ${rule}`} style={{ height: 40 }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-body font-bold">{title}</p>
        <p className="line-clamp-2 text-body-sm text-[#9a9a9a]">{body}</p>
        {actionLabel ? (
          <p className="mt-1 text-body-sm font-bold text-[#ffc107]">
            {actionLabel}
          </p>
        ) : null}
      </div>
      {dismissible ? <span className="text-[#666]">×</span> : null}
    </div>
  );
}

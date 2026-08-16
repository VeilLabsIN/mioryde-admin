"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Input,
  PageHeader,
  SectionLabel,
} from "@/components/ui";
import {
  type AdminIdentity,
  ApiError,
  MIN_PASSWORD_LENGTH,
  api,
} from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";

/**
 * Your own account.
 *
 * Until this page existed there was no way for an admin to change their
 * password at all (BUG-041). Every account was permanently on a generated
 * secret that had been read off a terminal — which means it also lived in
 * scrollback, in shell history, and in whatever channel it was passed along
 * in. The account that can read every customer's address deserves better than
 * a credential nobody can rotate.
 *
 * Open to every role, deliberately. Securing your own account is the one
 * action an account must never lose, including one whose role was narrowed to
 * nothing.
 */
export default function SecurityPage() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setIdentity)
      .catch(() => setIdentity(null));
  }, []);

  // Checked here only to give the answer without a round trip. The server
  // enforces both independently — this is a courtesy, not a rule.
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const unchanged = next.length > 0 && next === current;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !unchanged &&
    !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    try {
      await api.changeOwnPassword({
        currentPassword: current,
        newPassword: next,
      });
      setDone(true);
      // Cleared on success so the new password is not left sitting in three
      // form fields on an unattended screen.
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not change the password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[620px] space-y-6">
      <PageHeader
        title="Security"
        subtitle="Your account and password."
      />

      <Card className="p-5">
        <SectionLabel>Signed in as</SectionLabel>
        <p className="text-sm font-medium">{identity?.name ?? "—"}</p>
        <p className="text-[13px] text-fg-muted">{identity?.email ?? ""}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.5px] text-fg-faint">
          {identity ? ROLE_LABEL[identity.role] : ""}
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>Change password</SectionLabel>

        <form onSubmit={submit} className="space-y-4">
          <Field
            id="current"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />

          <Field
            id="next"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. A phrase of a few words beats a short one with symbols in it.`}
            problem={
              tooShort
                ? `Too short — ${MIN_PASSWORD_LENGTH} characters minimum.`
                : unchanged
                  ? "This is the password you already have."
                  : null
            }
          />

          <Field
            id="confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            problem={mismatch ? "The two entries do not match." : null}
          />

          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}

          {done && (
            <p role="status" className="text-[13px] text-ok">
              Password changed. Every other session has been signed out — this
              tab stays signed in.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit} loading={busy}>
              Change password
            </Button>
            <span className="text-[12px] text-fg-faint">
              Signs out your other devices.
            </span>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  problem,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
  problem?: string | null;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted"
      >
        {label}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Points a screen reader at whichever message is actually shown,
        // rather than announcing a hint that has been replaced by an error.
        aria-describedby={problem ? `${id}-problem` : hint ? `${id}-hint` : undefined}
        aria-invalid={problem ? true : undefined}
      />
      {problem ? (
        <p id={`${id}-problem`} className="mt-1 text-[12px] text-warn">
          {problem}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-fg-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

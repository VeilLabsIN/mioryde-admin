"use client";

import { useEffect, useState } from "react";
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
  type AdminAccount,
  type AdminRole,
  ApiError,
  api,
} from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";

const ROLES: AdminRole[] = ["owner", "ops", "finance", "support"];

/**
 * What each role is for, in one line.
 *
 * Shown beside the selector rather than kept in a wiki, because the moment
 * somebody needs it is the moment they are choosing one — and a role granted
 * because the label sounded about right is how an operations account ends up
 * settling payouts.
 */
const ROLE_SUMMARY: Record<AdminRole, string> = {
  owner:
    "Everything, including this page. Only an owner can create admins or change roles.",
  ops: "Deliveries, customers, partners and verification. No money, no admin accounts.",
  finance: "Payouts, bank checks, collections and rate cards. No customer or partner records.",
  support: "Deliveries and customers only — the narrowest useful account.",
};

/**
 * Who can sign in to this panel.
 *
 * Before this page, admins existed only if somebody ran a CLI script on a
 * machine holding database credentials, and there was no way to change a role,
 * end an account's access, or reset a forgotten password short of doing it in
 * SQL.
 *
 * **There is no delete.** Audit entries point at the account that made them,
 * so removing one would turn a departing employee's history into actions by
 * nobody. Deactivating ends access immediately and keeps the record readable,
 * which is the property the audit log exists for.
 */
export default function AccessPage() {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /**
   * A password the server has just generated, held for exactly as long as it
   * is on screen. It is stored only as a hash, so this is the one and only
   * time anybody can read it — losing it means another reset, not a lookup.
   */
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
    reason: "created" | "reset";
  } | null>(null);

  async function load() {
    try {
      const res = await api.adminUsers();
      setAdmins(res.results);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load admins.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const owners = (admins ?? []).filter((a) => a.role === "owner" && a.isActive);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        title="Access control"
        subtitle={
          admins === null
            ? "Loading…"
            : `${admins.filter((a) => a.isActive).length} active · ${owners.length} owner${owners.length === 1 ? "" : "s"}`
        }
        actions={
          <Button onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "Add admin"}
          </Button>
        }
      />

      {issued && (
        <IssuedPassword issued={issued} onDismiss={() => setIssued(null)} />
      )}

      {creating && (
        <CreateAdmin
          onCancel={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setIssued({ ...result, reason: "created" });
            void load();
          }}
        />
      )}

      <Card className="overflow-hidden">
        {admins === null ? (
          error ? (
            <EmptyState title="Could not load admins" hint={error} />
          ) : (
            <SkeletonRows rows={5} />
          )
        ) : admins.length === 0 ? (
          <EmptyState title="No admin accounts" />
        ) : (
          <>
            <div
              className="grid grid-cols-[minmax(0,1fr)_150px_130px_120px] gap-4 border-b
                         border-line bg-panel px-4 py-2 font-mono text-[9px] uppercase
                         tracking-[2px] text-fg-muted"
            >
              <span>Account</span>
              <span>Role</span>
              <span>Last seen</span>
              <span className="text-right">Actions</span>
            </div>

            <ul className="divide-y divide-line">
              {admins.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  // An owner may not demote the only other route back in.
                  isLastOwner={
                    admin.role === "owner" && admin.isActive && owners.length <= 1
                  }
                  onChanged={load}
                  onReset={(result) =>
                    setIssued({ ...result, reason: "reset" })
                  }
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="text-[12px] text-fg-faint">
        Accounts are deactivated, never deleted — audit entries point at the
        account that made them, and removing one would turn its history into
        actions by nobody. Deactivating takes effect immediately.
      </p>
    </div>
  );
}

function AdminRow({
  admin,
  isLastOwner,
  onChanged,
  onReset,
}: {
  admin: AdminAccount;
  isLastOwner: boolean;
  onChanged: () => void | Promise<void>;
  onReset: (result: { email: string; password: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e: unknown) {
      // The server owns these rules — self-edit, last owner. Showing its
      // sentence rather than a generic failure is what makes a refusal
      // readable as a rule instead of a bug.
      setError(e instanceof ApiError ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_150px_130px_120px] items-center gap-4
                  px-4 py-3 ${admin.isActive ? "" : "opacity-55"}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">
          {admin.name}
        </span>
        <span className="block truncate text-[12px] text-fg-faint">
          {admin.email}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-2 text-[11px]">
          {!admin.isActive && (
            <span className="text-fg-muted">Deactivated</span>
          )}
          {admin.lockedUntil && (
            <span className="text-warn">
              Locked until{" "}
              {new Date(admin.lockedUntil).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {admin.activeSessions > 0 && (
            <span className="text-fg-faint">
              {admin.activeSessions} session
              {admin.activeSessions === 1 ? "" : "s"}
            </span>
          )}
        </span>
        {error && (
          <span role="alert" className="mt-1 block text-[12px] text-danger">
            {error}
          </span>
        )}
      </span>

      <span>
        <select
          value={admin.role}
          disabled={busy || isLastOwner}
          aria-label={`Role for ${admin.name}`}
          onChange={(e) =>
            void run(() =>
              api.updateAdminUser(admin.id, {
                role: e.target.value as AdminRole,
              }),
            )
          }
          className="h-9 w-full border border-edge bg-panel px-2 font-sans text-[13px]
                     text-fg transition-colors duration-150 focus:border-accent
                     focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] leading-snug text-fg-faint">
          {isLastOwner ? "The last owner — promote someone else first." : ROLE_SUMMARY[admin.role]}
        </span>
      </span>

      <span className="font-mono text-[11px] tabular-nums text-fg-faint">
        {admin.lastLoginAt
          ? new Date(admin.lastLoginAt).toLocaleDateString()
          : "Never"}
      </span>

      <span className="flex flex-col items-end gap-1.5">
        <GhostButton
          disabled={busy || isLastOwner}
          onClick={() =>
            void run(() =>
              api.updateAdminUser(admin.id, { isActive: !admin.isActive }),
            )
          }
          className={admin.isActive ? "hover:border-danger hover:text-danger" : ""}
        >
          {admin.isActive ? "Deactivate" : "Reactivate"}
        </GhostButton>

        {confirmingReset ? (
          <span className="flex gap-1">
            <GhostButton
              disabled={busy}
              className="border-danger text-danger"
              onClick={() =>
                void run(async () => {
                  const result = await api.resetAdminPassword(admin.id);
                  setConfirmingReset(false);
                  onReset(result);
                })
              }
            >
              Confirm
            </GhostButton>
            <GhostButton onClick={() => setConfirmingReset(false)}>
              No
            </GhostButton>
          </span>
        ) : (
          <GhostButton
            disabled={busy}
            onClick={() => setConfirmingReset(true)}
            // Confirmed because it is irreversible in the way that matters:
            // it signs the person out everywhere and the old password is gone.
            title="Issues a new password and signs this account out everywhere"
          >
            Reset password
          </GhostButton>
        )}
      </span>
    </li>
  );
}

function CreateAdmin({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (result: { email: string; password: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createAdminUser({
        email: email.trim(),
        name: name.trim(),
        role,
      });
      onCreated(result);
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Could not create the account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionLabel>New admin</SectionLabel>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="new-name"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted"
            >
              Name
            </label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>

          <div>
            <label
              htmlFor="new-email"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted"
            >
              Email
            </label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@mioryde.com"
              required
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="new-role"
            className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-fg-muted"
          >
            Role
          </label>
          {/* Defaults to support — the narrowest role. A default of anything
              wider means a mis-click grants more than was intended, and the
              person who notices is rarely the person who clicked. */}
          <select
            id="new-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="h-10 w-full border border-edge bg-panel px-3 font-sans text-sm
                       text-fg transition-colors duration-150 focus:border-accent
                       focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] leading-snug text-fg-faint">
            {ROLE_SUMMARY[role]}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}>
            Create account
          </Button>
          <GhostButton type="button" onClick={onCancel}>
            Cancel
          </GhostButton>
          <span className="text-[12px] text-fg-faint">
            A password is generated and shown once.
          </span>
        </div>
      </form>
    </Card>
  );
}

/**
 * The generated password, shown once.
 *
 * Loud on purpose. It is stored only as an argon2id hash, so this really is
 * the only time it can be read — an owner who closes this without copying it
 * has to reset again, and the failure mode of a quiet notice is discovering
 * that after the new person has already been told to log in.
 */
function IssuedPassword({
  issued,
  onDismiss,
}: {
  issued: { email: string; password: string; reason: "created" | "reset" };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card className="border-accent/50 p-5">
      <SectionLabel>
        {issued.reason === "created" ? "Account created" : "Password reset"}
      </SectionLabel>

      <p className="text-[13px] text-fg-soft">
        Password for <span className="font-medium">{issued.email}</span>. This
        is the only time it can be read — it is stored only as a hash.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="select-all border border-edge bg-panel px-3 py-2 font-mono text-sm">
          {issued.password}
        </code>
        <GhostButton
          onClick={() => {
            void navigator.clipboard
              .writeText(issued.password)
              .then(() => setCopied(true))
              // Clipboard access can be refused by permissions policy. The
              // value is selectable either way, so this only ever downgrades
              // to copying it by hand.
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </GhostButton>
        <GhostButton onClick={onDismiss}>Done</GhostButton>
      </div>

      <p className="mt-3 text-[12px] text-fg-faint">
        Send it through something other than the channel they will use it in,
        and have them change it on the Security page after signing in.
      </p>
    </Card>
  );
}

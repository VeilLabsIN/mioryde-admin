"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, SectionLabel } from "@/components/ui";
import { ApiError, api, auth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in — skip the form.
  //
  // Asks the server rather than checking storage: the refresh cookie is
  // HttpOnly and unreadable here, so the only way to know whether a session
  // survives is to try to restore it. A failure is the ordinary first-visit
  // case and leaves the form on screen.
  useEffect(() => {
    let cancelled = false;
    void api.restoreSession().then((identity) => {
      if (!cancelled && identity) router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password);
      router.replace("/");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not reach the server.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      {/* Hazard band — the brand's signature, used sparingly so it stays a
          signature rather than decoration. */}
      <div aria-hidden className="hazard fixed inset-x-0 top-0 h-1 opacity-60" />

      <div className="animate-rise w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="grad-accent chamfer grid size-11 place-items-center">
            <span className="font-mono text-lg font-bold text-on-accent-bright">M</span>
          </div>
          <div>
            <p className="font-sans text-lg font-semibold leading-tight">Mioryde</p>
            <p className="font-mono text-[10px] uppercase tracking-[2.5px] text-fg-muted">
              Operations
            </p>
          </div>
        </div>

        <SectionLabel>Staff sign-in</SectionLabel>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-fg-muted"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mioryde.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-fg-muted"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="animate-slide-in border-l-2 border-danger pl-3 text-[13px] text-danger"
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="mt-2 w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-fg-faint">
          Staff accounts are created by an administrator. Repeated failed
          attempts lock the account for 15 minutes.
        </p>
      </div>
    </main>
  );
}

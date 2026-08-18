# Mioryde — project context

**Handoff document.** Read this before touching any of the four repositories.
It is the shortest path from "I have the codebase" to "I can make a safe
change". Everything here is verified against the code, not remembered.

> **Keep this current.** Update it in the same commit as any change to
> architecture, invariants, status, or blockers. A stale handoff is worse than
> none — it is believed.

**Last updated:** 18 August 2026 (dispatch board, access control, monitoring,
deeper analytics, GST credit notes, pagination, order and customer detail,
launch readiness)

---

## 1. What Mioryde is

An intra-city logistics platform for India (a Porter clone), built for a client
operating from Ludhiana, Punjab. Customers book a vehicle to move goods across a
city; partners (drivers) accept jobs, collect, deliver, and are paid.

- **Legal entity:** Miorigin Private Limited
- **Launch region:** Punjab (Ludhiana, Amritsar, Jalandhar, Patiala)
- **Geography rule:** location *lookup* works India-wide; only *serviceable
  zones* are restricted. Do not narrow lookup to the launch region.
- **Currency:** INR only. Money is integer paise everywhere.

## 2. The four repositories

| Repo | Stack | Purpose |
|---|---|---|
| `mioryde-api` | NestJS 11, PostgreSQL 17 + PostGIS, Drizzle, plain-SQL migrations | Server. The hub every other repo talks to |
| `mioryde-admin` | Next.js (App Router), React, Tailwind | Internal operations panel |
| `mioryde-customer-app` | Flutter 3.44 / Dart 3.12, Riverpod 3, go_router 17, Dio 5 | Customer app |
| `mioryde-rider-app` | Same as customer | Partner (driver) app |

All on `main`, remote `github.com/VeilLabsIN/<repo>`. A fifth repo,
`mioryde-web` (marketing site), is on `master` and has **no working remote** —
its commits are local only. Deliberate; do not "fix" it without asking.

Heads at last update: api `86c2c0e` · admin `7747078` · customer `b9ede51` ·
rider `ce48a47`. All four clean and pushed.

## 3. Run it locally

```bash
# 1. Infrastructure (Docker Desktop must already be running — start it yourself,
#    launching it from a tool call kills it)
cd mioryde-api && npm run db:up

# 2. Server
npm ci && npm run db:migrate && npm run db:seed && npm run dev   # :3000, prefix /v1

# 3. Admin panel
cd ../mioryde-admin && npm ci && npm run dev                     # :3100

# 4. Either app
cd ../mioryde-rider-app && flutter run --dart-define-from-file=env/emulator.json
```

Useful: `npm run payout:batch [YYYY-MM-DD]` runs a payout batch by hand.
`npm run admin:create -- --email x@y.com --name "X" --role owner` makes the
*first* admin. After that use Access control in the panel — the script still
carries `ON CONFLICT DO UPDATE`, so pointing it at an existing address silently
resets that person's password, and it can demote the last owner. The panel
refuses both.

OTP codes print to the server log in development (`SMS_PROVIDER=log`) — grep
`OTP for`.

## 4. Architecture, and the rules behind it

These are load-bearing. Breaking one is how money or access goes wrong.

**Money is integer minor units (paise).** `Money` in TS and Dart. Never a float,
never a rounded double. Postgres stores `numeric(12,2)`; postgres.js returns
numerics as *strings*, so parse deliberately.

**The ledger is double-entry and append-only.** Every posting sums to zero — a
deferred constraint trigger enforces it at COMMIT. Rows can never be updated or
deleted; a mistake is corrected by posting its reverse. Balances are maintained
by trigger from the lines, so they cannot disagree with the entries.

**Collected cash offsets payouts.** A partner holding COD cash is holding the
platform's money. `cash_in_hand` is netted out of what they can withdraw, and
past `CASH_IN_HAND_LIMIT_MINOR` they cannot go on duty. Only finance can clear
it — a partner clearing their own balance would make the control decorative.

**Bank accounts: verified, not merely present.** Account numbers are AES-256-GCM
encrypted (`FIELD_ENCRYPTION_KEY`); IFSC and last-four stay plaintext so support
never needs the key. **Any change resets verification**, and the nightly batch
pays only verified accounts — that is what makes account takeover unprofitable.

**Identity documents need two different people to approve.** Enforced as a
database CHECK, plus a constraint that the two signatures differ. Aadhaar, PAN
and driving licence only; vehicle paperwork is single-signature.

**Three JWT audiences:** `mioryde-app` (customer), `mioryde-partner`,
`mioryde-admin`. A global JwtAuthGuard protects customer routes, so **every
rider and admin controller needs `@Public()`** to opt out of it — its own guard
then does the real check. This trips everyone once.

**Admin auth is an HttpOnly refresh cookie + in-memory access token.** Nothing
durable in localStorage.

**Every admin request re-reads the session and the account.** `AdminGuard`
verifies the token's signature and then looks up the session row: revoked or
expired session, or a deactivated account, is a 401, and **the role comes from
the row, not from the token**. Without this, deactivating an admin left them
fully privileged until their access token expired — up to fifteen minutes, in
precisely the situation where that is least acceptable (BUG-040). It costs one
indexed lookup per request; do not "optimise" it away.

**Rate limiting keys on the verified account, not the IP.** Indian carriers put
tens of thousands of subscribers behind few addresses (CGNAT); per-IP limits
would let one user lock out a city.

**Invoices are immutable and gapless** (GST Rule 46). Corrections are credit
notes, never edits.

**The panel reports its own launch readiness.** `/readiness` computes every
blocker from live configuration rather than from a list somebody maintains —
GSTIN, SMS, Razorpay, S3, Firebase, agreement — and a banner carries the worst
of them onto whatever page the operator is on. When you clear a blocker, that
page is where you confirm it, and nothing needs editing to stay true.

**The ledger's guarantees are triggers, and triggers can be absent.** A restore
that replayed rows before the functions existed, or a load run with
`session_replication_role = replica`, leaves a database that looks entirely
normal and quietly disagrees with itself. `/monitoring` checks all three
invariants directly against the rows — postings summing to zero, stored
balances matching their lines, and the global net being exactly zero. It scans
every ledger line; when that stops being cheap the answer is a nightly job
writing its result somewhere the page reads, not a shallower check.

**The admin CSP carries `'unsafe-inline'` for scripts, deliberately.** A strict
`script-src 'self'` blocked Next's inline hydration scripts and the panel
rendered a blank page while building, typechecking and passing every test. A
per-request nonce was implemented and abandoned — Next 16.2.10 does not
propagate it (verified: zero nonce attributes in a production build). See
`mioryde-admin/src/middleware.ts`. **Do not "harden" this without checking the
panel still hydrates in a browser.**

**Outbox pattern for notifications** (at-least-once). Money never goes through
it — ledger postings share the transaction of the thing they record.

**`order_events` records more than transitions.** A partner declining a job
writes a `pending → pending` row. Anything asking "when did this order enter
its current status" must exclude those (`from_status IS DISTINCT FROM
to_status`), or a delivery nobody has accepted in twenty minutes reads as
thirty seconds old — reporting the dispatch problem as its own absence. The
dispatch board depends on this; so would any SLA measure.

**Elapsed times in the panel are measured against the server's clock.** Every
response that drives a duration carries `asOf`, and the client subtracts the
measured skew. A workstation four minutes fast would otherwise age every row
on the dispatch board by four minutes — uniformly and plausibly, which is
worse than an obvious error.

**`inList()` for `IN (...)` clauses.** `= ANY(${jsArray})` through Drizzle fails
with "requires array on right side". This has been fixed four times.

## 5. Where the work stands

Complete and verified against a live database:

- Booking, quotes, fares (OSRM routing), dispatch, live tracking
- Payments (Razorpay integration written), wallet, COD with a ₹5,000 cap
- Partner onboarding: documents, dual approval, vehicles, agreement, bank
- Financial integrity: double-entry ledger, cash netting, collection ceiling,
  nightly payout batch, GST invoicing and credit notes
- Admin panel: 18 pages including KYC review, bank checks, collections, a live
  dispatch board, agreement publishing, access control (create admins, change
  roles, deactivate, reset and change passwords), monitoring (queue depth,
  dispatch latency, ledger integrity), analytics (trends, hour-of-day demand,
  partner leaderboard, repeat-customer rate, custom range, CSV export),
  delivery and customer detail pages, and launch readiness
- Every list endpoint is paginated with real totals; filters, search and page
  live in the URL on deliveries, customers and partners, so views are shareable
- CI on all four repos — builds, boots the API, builds real APKs, checks no
  demo path reached a release build

**Roughly stage 10–11 of 14.** Remaining stages are growth features, scale
features, integration/hardening, and launch ops.

Not built (no schema exists): scheduled deliveries, returns, tips, incentives,
support tickets, proof of delivery, enterprise accounts, gateway↔ledger
reconciliation.

**Refunds: the tax half is built, the money half needs decisions.**

Done — `0023_credit_notes.sql` and `CreditNoteService`. Its own gapless series
(`MIO/CN/<fy>/<n>`), separate from the invoice series as Rule 53 requires;
immutable like invoices; many notes per invoice, so partial refunds work; and a
constraint trigger that takes `FOR UPDATE` on the invoice row so two concurrent
credits cannot together exceed what was charged. `apportionCredit` splits a
tax-inclusive amount across the invoice's own components rather than
recomputing from a rate, so the parts always sum exactly and a full credit
mirrors the invoice.

**It issues the document; it does not move money.** That separation is
deliberate — a refund failing at the gateway must not leave an unissued credit
note, and a credit note for a supply that never happened must not imply a
payment.

Still undecided, and these are business calls rather than code:

1. **Destination** — wallet only, or gateway too? Wallet is buildable and
   verifiable today; `RazorpayGateway` has no `refund()` and no credentials, so
   that leg would ship inert.
2. **Partner earnings** — claw back, platform absorbs, or refuse refunds after
   the nightly batch has paid? There is no negative-balance policy in the
   schema, so clawback is the expensive answer.
3. **COD** — the customer paid cash to the driver and the platform never held
   it, so a refund is the platform paying out money it never received.

Built but not wired to a UI: Truecaller one-tap button (customer app), partner
history tab (admin).

## 6. Blocked on the client, not on code

Nothing in this list can be worked around. Each is code that is written, tested
and inert.

| Needed | Blocks |
|---|---|
| **Real GSTIN** — the one on file is a dummy that passes every format check | Every invoice is legally invalid |
| SMS gateway + TRAI DLT registration | All OTP login |
| Razorpay credentials | All online payment |
| AWS S3 bucket, **ap-south-1 (Mumbai)** | KYC uploads, so all onboarding |
| Firebase service account + `google-services.json` in both apps | Push notifications |
| Counsel-drafted partner agreement | The seeded text is a marked placeholder |

Degraded but working without: Maps key, Exotel masked calling, Truecaller client
id, Sentry DSN.

**Vendor choices are decided and documented** at the end of
`mioryde-api/.env.example`, with the reasoning for each. The short version:
S3 Mumbai (residency), MSG91 (DLT), Razorpay, FCM, Exotel, self-hosted OSRM,
Google Maps for display only. Each is a config change to replace, not a
rewrite.

## 7. Conventions worth matching

- **One `PageHeader` for every page.** Twelve pages had grown three heading
  treatments; they now share one component. Add a page, use it.
- **Comments explain *why*, never *what*.** The codebase is dense with reasoning
  about failure modes. Match that; a comment restating the code is noise.
- **Feature slices** in Flutter: `lib/features/<name>/{domain,data,presentation}`.
- **Unknown wire values fail safe.** An unrecognised document status reads as
  "in review", never "approved". An unknown onboarding stage reads as the
  earliest. Keep this direction.
- **Server decides, client displays.** Where a rule exists (payout blocked, over
  the cash limit), read the server's answer rather than recomputing it.
- **A partner's earnings are `orders.rider_payout`, never a recomputation.**
  `commission_pct` is the *platform's* cut — `payout = total * (1 - pct/100)`
  — so multiplying by it yields the complement of what you wanted. It is also
  frozen at delivery, so recomputing from a rate that has since changed
  restates history. This was wrong on the partner detail page for a long time
  and reported a quarter of what partners had earned (BUG-043).
- **Verify live.** Three bugs here were caught only by running the thing while a
  full test suite passed. Tests assert what you thought to assert.
- Migrations are plain SQL, numbered, never edited after being applied — the
  runner checksums them.
- No `Co-Authored-By` lines in commit messages.

## 8. Where to look

| Question | File |
|---|---|
| Every known bug, open and closed | `mioryde-api/Bugs.md` |
| Every config value and what it blocks | `mioryde-api/.env.example` |
| Role → capability matrix | `mioryde-admin/src/lib/permissions.ts` |
| Admin API client and types | `mioryde-admin/src/lib/api.ts` |
| Schema history | `mioryde-api/migrations/` (23 files) |
| Admin panel audit and roadmap | `mioryde-admin/PATTERNS.md`, `STAGES.md` |
| Money handling | `mioryde-api/src/common/money.ts` |
| Ledger rules | `mioryde-api/migrations/0018_ledger.sql` |

Test counts at last update: api 202, admin 60, rider app 84, customer app 85.

## 9. Environment quirks that waste an hour if you do not know them

- **Docker Desktop is started by the user, by hand.** Launching it from a tool
  call kills it. If the containers are down, ask rather than trying.
- **Flutter is not on PATH.** It lives at `C:\Users\datan\dev\flutter\bin`.
- **The admin panel must run on 3100**, which `npm run dev` now pins. The API
  holds 3000, and the API's CORS allowlist contains only 3100.
- **Browser automation cannot drive the admin login form.** Typing and clicking
  through it produces no request, while the same form works for a human. A
  tooling limit, not a bug — it has been chased once already, do not repeat it.
- `/tmp` in Git Bash and `/tmp` in Windows Python are different directories.
  Use the session scratchpad for files both need to see.

## 10. If you are picking this up cold

1. Read this file, then `mioryde-api/Bugs.md`.
2. Run the stack (§3) and sign in to the admin panel.
3. Pick from §5 "built but not wired to a UI" — those are small, self-contained,
   and the API is already verified.
4. Before committing: lint, typecheck, test **and boot/build**. CI does all
   four; do not rely on tests alone.
5. Update this file in the same commit.

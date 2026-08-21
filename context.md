# Mioryde — project context

**Handoff document.** Read this before touching any of the four repositories.
It is the shortest path from "I have the codebase" to "I can make a safe
change". Everything here is verified against the code, not remembered.

> **Keep this current.** Update it in the same commit as any change to
> architecture, invariants, status, or blockers. A stale handoff is worse than
> none — it is believed.

**Last updated:** 21 August 2026 (rate card editing, CSV exports, sidebar
collapse and drawer, liveliness)

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

### Uncommitted work in the tree (2026-08-21)

Panel work, plus the API endpoints it needed. Typechecks, lints, and both
suites pass — **API 257, panel 78**. Both repos build.

**Rate card editing** (`PATTERNS.md` D8). `RateCardEditor` publishes all six
amounts at once, because the server supersedes rather than edits. Rupees become
paise through `lib/rupees.ts` as *text* — never `Math.round(Number(x) * 100)`,
which gets `1.15` and `8.7` wrong. New `POST /admin/rate-cards/preview` prices a
hypothetical trip through `FareCalculator`, so the panel shows "₹98.65 → ₹87.32"
without owning a second copy of the fare formula. The fare-ordering validation
on publish was a `NotFoundException`; it is now a 400.

**Four more CSV exports** (D9). `common/csv.ts` carries the BOM, CRLF, quoting
and formula-neutralisation; `components/ExportButton.tsx` carries the token
fetch and the object-URL dance. Payouts, collections, the audit log and the
partner leaderboard, each filtered the way its screen is. `daily.csv` was
refactored onto the same helper.

**Sidebar, keyboard and responsive** (`STAGES.md` 7). Per-group collapse stored
per browser, Alt+N to focus the rail, and a drawer below `md` with a control in
the top bar.

**Liveliness** (`STAGES.md` 9, partial). `LiveValue` flashes a figure that
changed — dashboard, monitoring, live board, map — and `Freshness` says how old
a polled page is. Audio (Stage 10) is not started.

**Verified against a real Postgres, a booted API and a browser**, through
throwaway routes that render the real page components with a token already in
memory (the panel's pages sit behind a client-side auth guard and signing in
through the form is not available):

- Publishing from the UI moved the 8ft Truck from ₹24.00/km to ₹20.00/km. The
  preview showed "₹401.20 → ₹377.60" for a 5 km trip *before* the click, the
  table reloaded with the new rate, exactly one live card remained for the
  pair, the old row was closed with `effective_to`, and `rate_card.publish`
  appeared in the audit log.
- The preview endpoint returns ₹98.65 for the published 2-wheeler card and
  reports `minFareApplied` when the floor bites — the same figures
  `fare.calculator.test.ts` pins.
- A base fare above the minimum answers **400** with the server's own sentence.
- All five CSV endpoints answer 200 with a BOM, the right filename and the
  exposed `Content-Disposition`. A partner named `Kumar, R. "Raju"` and a
  reference of `=HYPERLINK("http://evil.example","claim")` both came out
  quoted and neutralised, with the phone masked.
- The payouts page's Export button read the server-supplied filename
  cross-origin (`:3105` → `:3005`), which is what the expose header exists for.
- Switching from one card to another *in the same zone* re-initialises the
  form. It did not before — React reused the instance, and the second card was
  edited through the first card's numbers. The reset lives **in the editor**,
  not in a `key` at the call site, and was re-proven with a harness rendering
  two editors in one position with no key: switching discarded an abandoned
  edit and reloaded every field from the new card.
- The payouts queue masks the number and reveals it through the audited route:
  as `finance`, the list and the CSV both read `+••••••• 00002`, the Reveal
  button returned `+919876500002`, and `rider.phone_revealed` was written with
  the operator's name and IP. As `support`, both the reveal and the list are
  403.

Everything was torn down afterwards: no containers, no dev servers, no
harnesses.

**Phone masking on the payouts queue.** That page returned partner numbers in
full while every other surface masked them and audited a reveal. `list()` now
masks, so the CSV export cannot un-mask it either, and the page uses the same
`RevealPhone` control as `/riders`. `POST /admin/riders/:id/reveal-phone`
accepts `finance` as well as `ops` — a tightening, since finance previously read
numbers with no record at all, and a mask with no reveal on their own screen
would just have created pressure to remove it again. Support is still refused.
`test/admin-phone-masking.test.ts` fails if any admin list assigns an unmasked
`phone`.

### Uncommitted work in the tree (2026-08-20)

A large redesign and feature run that has **not been committed** — Nikhil
commits himself. All of it typechecks, builds, and passes both suites
(**API 245, panel 71**). Verified against real Postgres and a real API unless
noted.

**Design system.** Default theme is now `daylight` (warm off-white `#f7f5ee`,
brand yellow, green as the second voice); dark is `tokyo` (Tokyo Night). The
old `midnight` key migrates to `tokyo` in the boot script so nobody loses their
choice. Two accent tokens exist because `--accent` is read as *text* in 39
places: `--accent` is the deepest gold clearing 4.5:1, `--accent-bright` is the
real brand yellow for fills. Radius scale 4/8/16px was adopted from the design
spec; `chamfer` survives only on brand moments (logo, primary button, pills) —
the rule is **chamfer if it is branding, radius if it is furniture**. Light mode
gained a dot grid; `--panel` was retuned in both themes because the bottom of
the foreground ramp measured 4.45:1 and 4.41:1 against it.

**Night Mode arrival.** Full-screen dusk transition with the words the brief
asked for. It deliberately does **not** reload — an ops panel reload discards a
half-typed cancellation reason. `pointer-events: none` throughout, silent on
first load and when leaving night, disabled under reduced motion.

**Login.** Two-column composition centred in a 1040px container, animated SVG
scene (drawn route, drifting light, city grid) spanning the whole page, form on
its own card. Live greeting that knows the time of day and greets the local part
of the typed email — derived client-side, so it cannot leak whether an account
exists. Caps-lock warning, show/hide, and **Remember me**.

**Sessions.** Absolute expiry: one day, or seven with Remember me. Rotation
*inherits* the deadline rather than minting a new one — the old behaviour was a
sliding window that never actually expired. Rotation now also revokes the row it
replaced, so exactly one row per chain is live and signing out kills it.

**WUDA + FAQ.** `0024_knowledge.sql`, a 40-entry curated corpus authored in
code, Postgres full-text + `word_similarity` + tag-overlap retrieval, and a
three-circle audience ladder (`everyone` / `internal` / `restricted`) **filtered
in SQL**. Owner-only writes. The model layer is Gemini over `fetch`; with no key
it degrades to returning entries verbatim and says so on screen.

**Security.** `assertNoClientSecrets()` refuses to boot if a server secret's
*value* appears under `NEXT_PUBLIC_`/`EXPO_PUBLIC_`/`VITE_`; a bundle scanner
fails the panel's test run on credential-shaped strings in built JS; `redact()`
strips keys from logs. `docs/secrets.md` explains which keys can be hidden and
which can only be *restricted* at the provider. `.env` is now git-ignored in
both Flutter apps.

**Live map** (`/map`). New `GET /admin/live/map` snapshot; Leaflet with raster
tiles (no API key in the browser); rider state derived from fix freshness, not
`is_online`; markers updated in place so pins tween; click-to-focus with route
highlight. Tile host flows into CSP `img-src` **and** `connect-src` — the map
probes one tile with `fetch` because a rejected key returns HTTP 403 *with a
valid PNG*, so `tileerror` never fires.

**Dashboard.** New `GET /admin/dashboard`: four live figures plus 14 days of
history in one round trip. KPI cards with sparklines and a delta against the
*same slice* of yesterday.

**Riders.** Card/table toggle (preference in `localStorage`, not the URL), new
`GET /admin/riders/:id/orders`, tabbed detail (Overview / Deliveries / History).

**Layer switch.** Sidebar control filtering nav to customer side, partner side,
or everything. It is a **preference, not a permission** — `layers.test.ts` pins
that every layer view is a strict subset of "everything" for every role.

Not verified: WUDA's *grounded* answers (the Gemini project is denied — see §6),
and the authenticated pages have only been driven through throwaway harnesses,
never a real browser session.

### Previously complete and verified against a live database


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
| **Gemini API access** — project denied `generateContent` (403) on two separate projects, so it is the Google *account*, not the project | WUDA composes answers; it currently only quotes entries |
| MapTiler allowed origins — bare hostnames only, and `localhost` is absent | The basemap in local development; production origins are fine |

Degraded but working without: Maps key, Exotel masked calling, Truecaller client
id, Sentry DSN.

**Vendor choices are decided and documented** at the end of
`mioryde-api/.env.example`, with the reasoning for each. The short version:
S3 Mumbai (residency), MSG91 (DLT), Razorpay, FCM, Exotel, self-hosted OSRM,
Google Maps for display only. Each is a config change to replace, not a
rewrite.

## 7. Conventions worth matching

- **Help lives in `src/lib/help.ts`, not in a model.** One entry per page:
  what it is for, what people do there, and — the part that actually prevents
  support calls — the behaviour that is correct but surprising. A chatbot was
  asked for; this answers the same questions and cannot be confidently wrong
  about our own system, costs nothing per question, and works when the API is
  down. If a model is added later, ground it in this file rather than replace
  it. Add an entry whenever a page is added.
- **The shell owns location, pages own content.** The top bar (mark, command
  palette, identity) and the breadcrumb strip are rendered once by
  `(panel)/layout.tsx`. Pages supply a title and nothing about where they sit —
  `PageHeader` no longer takes a `breadcrumb` prop, because three pages passed
  one and the rest did not, so the trail read as decoration rather than
  furniture. `src/lib/nav.ts` is the single registry the sidebar, the palette
  and the breadcrumbs all read.
- **One `PageHeader` for every page.** Twelve pages had grown three heading
  treatments; they now share one component. Add a page, use it.
- **Use the type scale, not raw pixel sizes.** `text-micro` (9px, uppercase,
  tracked, bold), `text-meta` (11px), `text-body` (13px), `text-label` (15px),
  `text-title` (24px, PageHeader only), `text-figure` (28px). Defined in
  `globals.css`. Shared chrome — `ui.tsx`, `Sidebar`, `RevealPhone`,
  `ThemeSwitcher`, `charts`, the panel layout — is fully on the scale; the page
  files are not yet, and still carry roughly 150 raw sizes between them.
  Three sites are off the scale deliberately and say so in a comment: the
  sidebar nav marks and the two chart axis-tick sizes, because `text-micro`
  bakes in 2px of tracking and bold weight that is right for a label and wrong
  for a glyph or a column of numbers.
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

Test counts at last update: api 257, admin 78, rider app 84, customer app 85.
The two app figures have not been re-run since 18 August.

## 9. Environment quirks that waste an hour if you do not know them

- **Docker Desktop is started by the user, by hand.** Launching it from a tool
  call kills it. If the containers are down, ask rather than trying.
- **Flutter is not on PATH.** It lives at `C:\Users\datan\dev\flutter\bin`.
- **The admin panel must run on 3100**, which `npm run dev` now pins. The API
  holds 3000, and the API's CORS allowlist contains only 3100. **`mioryde-web`
  now pins 3200** — it defaulted to 3000 and silently answered the panel's API
  requests, which presents as "Could not reach the server" on the login screen
  with every process apparently running. If that message appears, check what
  actually owns 3000 before anything else.
- **`REDIS_URL` now points at a hosted Upstash instance**, not the local
  `mioryde-redis` container that is still running beside Postgres. Both work —
  ioredis speaks RESP over TLS to either. Redis is optional at one API
  instance (throttler counters fall back to in-memory, admin SSE events reach
  the one process that raised them) and becomes required at two, because
  cross-instance pub/sub is what makes the live board agree with itself.
- **Browser automation *can* drive the admin login form.** An earlier note here
  said it could not. It can, using `form_input` against the field refs rather
  than synthetic keystrokes into a focused element — the latter is what
  produced no request. Corrected 18 Aug 2026 after signing in that way.
- **Check whether 3100 is `next dev` or `next start` before wondering why an
  edit did nothing.** It has been left running as `next start` — a production
  build, which never picks up source changes. Symptom: the file on disk has
  your edit, `tsc` is clean, and the browser shows the old markup. Rebuild and
  restart rather than debugging the change.
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

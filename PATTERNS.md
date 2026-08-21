# Admin panel — audit and pattern file

**What this is.** A survey of the operations panel as it stands on 17 August
2026, and the patterns to apply to it. Written against the code, not from
memory: every claim below names the file it came from, and where something is
asserted as broken it was checked.

**How to use it.** Part A is defects — things that are wrong now. Parts B to F
are patterns, each stated as *what is there → what to do → why*. Part G is the
order I would do them in. Nothing here is a refactor for its own sake; each
item is either a thing an operator cannot currently do, or a thing that makes
the panel read as unfinished.

**Reference point.** Google Workspace Admin Console, which solves the same
problem for the same kind of user. It is worth copying from not because it is
beautiful — it is fairly plain — but because it is *legible under load*: an
operator who opens it mid-incident can find the thing. Specific patterns are
mapped in Part B.

---

## Part A — Defects found in this audit

Ordered by consequence. These are not "could be nicer"; they are wrong.

### A1 · Every list page except the audit log is capped at 25 rows, silently — *fixed*

**Critical.** Nine server-side list queries use `pageSize = 25` (one 20, one
50). Only `/audit` has any pagination UI (`audit/page.tsx:208`). Every other
page — deliveries, customers, partners, payouts, KYC queue, countersign queue,
bank checks, collections, pending vehicles — fetches page 0 and stops.

There is no "showing 25 of 340", no next button, and no indication that
anything was withheld. With 26 partners the panel cannot show the 26th, and
nothing on screen says so. An operator searching for a partner who does exist
gets an empty result and concludes the record is missing.

**Compounding it:** no list endpoint returns a total count. Even a "next" button
cannot say what it is paging through. Fixing this needs the backend first
(see D1).

**Fixed, all eleven lists** — `common/paging.ts`, a shared `<Pager>`, and
`{results, page}` on every list endpoint. This was not hypothetical: the dev
database has 27 customers, so two of them were genuinely unreachable through the
panel until this landed.

Finishing it turned up something worse. The audit log — the one list that already
*had* prev/next — had never returned a row at all: a `text = uuid` cast that
fails when Postgres plans the statement, so every call was a 500 and the page
showed its error state on every load since audit logging shipped. See BUG-044.

### A2 · There is no way to open a single delivery — *fixed*

**Critical for support.** The full admin API surface has no
`GET /admin/orders/:id`. Support's entire job is "what happened to order
MIO-XXXXX", and the panel's answer is a row in a list. There is no page showing
that order's status timeline (`order_events` holds every transition with actor
and location), its GPS breadcrumb (`order_tracks`), its invoice, its payment
state, its assigned partner, or its cancellation reason.

Everything needed already exists in the schema. Nothing exposes it.

**Fixed.** `GET /admin/orders/:id` and `/orders/[id]`. The timeline is the page:
every transition with its actor resolved to a name, human labels rather than
wire statuses, declines shown as declines rather than as progress, and the gap
between steps stated in words — two timestamps a reader has to subtract is the
difference between data and an answer. Plus route, both masked parties, the
money with the frozen payout, the invoice, any credit notes, and the rating.

The track polyline is deliberately excluded — it is the largest part by far and
only wanted when somebody opens a map, so it needs its own endpoint.

### A3 · The dashboard's "recent deliveries" links go nowhere useful — *fixed*

**High.** `page.tsx:87` links each recent delivery to
`/orders?search=${order.code}`. **No page in the panel reads the URL** —
verified: zero occurrences of `useSearchParams` or `searchParams` across
`src/`. `orders/page.tsx:27` initialises search from `useState("")` and never
consults the query string.

So the primary drill-through on the landing page silently drops its filter and
dumps the operator on the unfiltered list. It looks like it works.

**Fixed.** The deliveries page reads `search` from the URL, and the link is now
encoded. Verified: `/orders?search=LEDGER01` arrives with the search box filled
and one row shown, where before it listed all sixteen.

### A4 · No URL state anywhere — *fixed*

**High.** Following from A3: filters, search terms, selected tab, date range
and pagination all live only in React state. Consequences:

- No view is shareable. An operator cannot send a colleague a link to the thing
  they are looking at — the single most common act of collaboration in an ops
  team.
- Nothing is bookmarkable. "Pending KYC" is not a URL.
- Browser back does not restore state; it leaves the page entirely.
- A reload loses the operator's place.

**Fixed on all nine** via `lib/useUrlState.ts`. Deliveries, customers, partners,
payouts, collections, banking, the KYC tab, the audit log's two filters and the
analytics range and series all live in the query string.

Verified as deep links, which is the point of the work: `/kyc?tab=vehicles`
opens on that queue, `/payouts?status=paid` opens filtered, `/analytics?days=90
&series=delivered` opens on the right range *and* the right chart, and
`/audit?subject=<id>` opens showing only that record's history — which is the
question an audit log is actually asked, now answerable with a link somebody
can paste into an incident thread.

Two details worth keeping:

- **Unknown values fail safe.** An unrecognised `?tab=` or `?series=` reads as
  the default rather than rendering nothing, and an out-of-range `?days=` falls
  back rather than sending the server a value its DTO will refuse. Same
  direction as the apps' handling of unknown wire values.
- **A control seeded from the URL must re-seed when the URL arrives.** The
  analytics range picker initialised its two date inputs at mount, and the URL
  is read in an effect *after* mount — so a shared custom-range link fetched the
  right data while both boxes sat empty, which reads as the range having been
  ignored.

### A5 · Inputs suppress the focus ring that everything else gets

**Medium.** *Corrected after first publication — the original version of this
entry claimed buttons had no focus state at all. That was wrong, and it was
wrong because I checked the component file instead of the cascade.*

`globals.css:292` carries a global `@layer base` rule:

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

Verified present in the compiled production stylesheet. So `Button`,
`GhostButton` and every other interactive element **do** get a visible accent
ring on keyboard focus, without declaring anything themselves. That is the
right way round — one rule, no per-component repetition.

What is actually wrong is narrower: `Input` (`ui.tsx:81`) sets
`focus:border-accent focus:outline-none`. Tailwind utilities sit in a later
cascade layer than `base`, so `outline-none` wins and inputs are the one
control that loses the ring, keeping only a border-colour change. A border that
shifts from grey to amber is a weaker signal than a 2px offset outline, and it
is inconsistent with every other focusable thing in the panel.

**Fix:** drop `focus:outline-none` from `Input` and let the base rule apply,
keeping `focus:border-accent` as reinforcement. One deletion.

**Method note, since it cost something:** a component-level grep cannot answer
"does this element have a focus style" when the project sets one globally. Check
the compiled CSS or the browser's computed style. The appendix command for A5
was the wrong command.

### A6 · Five pages fake tables with CSS grid — *fixed*

**Medium, accessibility and consistency.** `access`, `customers`, `live`,
`orders` and `pricing` build tabular data as `<ul>` / `<li>` with
`grid-cols-[...]` and a separate header `<div>`. `analytics` and `audit` use
real `<table>`.

A screen reader gets no row/column relationship and no header association from
the grid versions — a cell is read as loose text with no idea which column it
belongs to. It is also two different implementations of the same thing, which
is the drift `PageHeader` was extracted to stop.

**Fixed on all five** via `components/DataTable.tsx`. Verified in a browser:
real `<table>`s, every `<th>` carrying `scope="col"`, an `sr-only` `<caption>`,
and widths applied through `<colgroup>` rather than repeated on each row.

Two of them needed the column API to grow, and the shape of that is worth
recording. `cell(row)` is a pure function of the row, which cannot express:

- **A row that owns state.** The access page's row holds `busy`, an inline
  refusal and a confirmation toggle, all shared across several of its cells.
- **A row that needs something the page holds.** The dispatch board's rows need
  the ticking clock and the measured server skew to compute elapsed time.

Both use `renderRow`, which returns the cells while `DataTable` still supplies
the `<tr>` — so the headers and widths stay defined once, which was the point.
`rowClassName` was added alongside it for the board's attention marker, which
belongs on the row against the table edge rather than inside a cell's padding.

The remaining `grid-cols-[...]` in `live/page.tsx` is the page's two-column
layout, not a table. Leave it.

### A7 · No error boundary, no 404, no loading boundary — *fixed and proven*

**Medium.** `src/app/` has no `error.tsx`, `not-found.tsx` or `loading.tsx` at
any level. An unhandled render error is a blank page — the exact symptom of
BUG-038, which took a browser to find. A mistyped URL gets Next's default 404
with none of the panel's chrome or navigation, so the operator's only way out
is the back button.

**Fixed, and finally proven rather than assumed.** A temporary conditional throw
was inserted into the rate cards page, built, and loaded: the boundary caught
it, the sidebar kept all ten nav links, the header survived, the real message
was shown with Try again and Back to overview, and clicking a sidebar link
escaped to `/orders` normally. The probe was reverted and `/pricing` confirmed
rendering again from the served build.

One detail worth keeping: an *unconditional* `throw` at the top of a component
makes the rest unreachable, and TypeScript then skips control-flow narrowing on
it — which failed the build on an unrelated line. The probe has to be
conditional to keep the component reachable.

### A8 · Two pages skip `PageHeader` — *overview now fixed*

**Low, but it is the documented convention.** `context.md` §7 says "One
`PageHeader` for every page. Twelve pages had grown three heading treatments;
they now share one component." The overview (`page.tsx:43`) hand-rolls
`<h1 className="mb-1 font-sans text-2xl font-semibold">` and the rider detail
page has no header component either.

Fixed on the overview in the commit that added this file. The rider detail page
is left for the breadcrumb work (B3), since it needs a back-link at the same
time and doing it twice would be waste.

### A9 · A stale comment on the dashboard — *fixed*

**Low, but it is the fourth instance of this pattern.** `page.tsx:62` reads
"Nothing drains the outbox yet, so a rising number here is expected rather than
alarming". The outbox worker exists and runs every three seconds
(`outbox.worker.ts:53`, and it was observed publishing during this session's
monitoring work). The comment describes a system that has not existed for some
time, and it tells the reader to ignore a number that is now a real signal.

See BUG-005, BUG-012, BUG-041 — a comment is not evidence.

Fixed in the commit that added this file. The threshold moved from `> 0` to
`> 25` at the same time, because with a worker draining every three seconds a
non-zero queue is an ordinary busy moment, and a tile that is permanently amber
teaches the operator to ignore it. The tile now points at Monitoring, which
reports the oldest event's *age* — the measure that actually distinguishes busy
from stuck.

### A10 · Almost no responsive work

**Medium.** Across 8,600 lines there are 10 `sm:`, 8 `lg:` and 1 `xl:`
breakpoint prefixes. The sidebar is a fixed rail, tables are fixed-width grids,
and the panel has only ever been looked at on a desktop. A dispatcher on a
laptop at 1366×768, or a manager checking payouts on a tablet, is not a
hypothetical user for an ops tool.

### A11 · No keyboard affordances at all

**Medium.** Zero `onKeyDown` handlers, zero Escape handling, no shortcuts, no
skip-link. With a 15-item sidebar, a keyboard user tabs through the entire
navigation before reaching content on every single page.

---

## Part B — UI/UX patterns worth taking from the Google Admin Console

Each of these is a pattern the reference console uses, why it works there, and
what it maps to here. This is the part that decides whether the panel reads as
professional.

### B1 · A banner system for things that need action, with the action in it — *done*

**Reference:** a red bar across the content area — *"Payment pending — Your
service requires a one-time payment of at least ₹500.00 to become active"* —
with **PAY NOW** on the right. Separately, an amber bar: *"You have 9 days to
verify your domain… Take action by Aug 24, 2026"* with a **Verify** button and
a **Learn more** link.

**Why it works:** the severity, the deadline, the consequence and the remedy are
in one sentence, and the remedy is one click away. It is not a notification the
operator has to go and find.

**Here:** the panel has no banner concept. It has real things to say —
`monitoring` knows the ledger is unbalanced, the outbox has dead letters and
Firebase is unconfigured; `kyc` knows documents are waiting; `banking` knows
accounts need checking. Today each is a number on a page nobody has open.

**Built** as `components/Banner.tsx`, mounted by the panel layout above
`<main>` — above the scroll container specifically, so a critical banner cannot
scroll away from an operator halfway down a queue.

`useAttention()` derives them from monitoring and readiness together: an
unbalanced ledger, abandoned notifications, outstanding launch blockers. Both
sources are role-gated and fetched with `allSettled`, so a support account that
can read neither simply gets no banner rather than an error — a 403 here is a
policy outcome, not a failure.

Rules as designed, and all implemented: at most two at once, critical sorted
first, every banner carries an action, and **critical cannot be dismissed** —
the only thing that should make an unbalanced ledger disappear is it no longer
being true.

One judgement worth recording: all outstanding blockers collapse into a *single*
banner. Six notices about a system that is not launched yet is not six pieces of
information.

### B2 · A global search that is the fastest path to a record

**Reference:** a wide search field pinned in the header on every page —
*"Search for users, groups, settings, or devices"*. It searches across entity
types, not within the current page.

**Why it works:** an operator with a ticket in front of them has one string —
an order code, a phone number, a name. One field, any page, no navigating first.

**Here:** each list page has its own search box, and the header has a large
empty space where the reference puts search. There is no way to search across
types, and no way to search at all without first choosing the right page.

**Pattern:** `⌘K` / `Ctrl-K` palette plus a header field, backed by one endpoint
(D2). Detect the input shape and route accordingly: `MIO-` prefix → order,
10 digits → phone across customers and partners, `@` → admin, otherwise name.
Show results grouped by type with the entity's key facts inline, and open the
record on Enter.

### B3 · Breadcrumbs on every page below the top level — *component done*

**Reference:** `Subscriptions > Google Workspace Business Base` and
`Account settings > Account management` sitting above the page title.

**Why it works:** it says where you are and gives a one-click way back up, which
matters most when you arrived from a link rather than by navigating.

**Here:** the rider detail page (`/riders/[id]`) has no breadcrumb and no back
link. The only way back to the partner list is the sidebar or the browser.
Every detail page added later (order detail, customer detail) will have the same
problem.

**Pattern:** add `breadcrumb` to `PageHeader` — an array of `{label, href}`
rendered above the title. Detail pages populate it; top-level pages omit it.

### B4 · Collapsible sections on dense settings pages

**Reference:** the Account settings page is a stack of collapsed cards —
Profile, Preferences, Smart features, Account management, Personalization,
Conflicting accounts management — each showing a one-line summary of its
contents and expanding on click.

**Why it works:** a page with twelve concerns is navigable rather than a wall.
The summary line means you often do not need to expand at all.

**Here:** `monitoring` is four stacked cards and will grow; `analytics` is now
eight sections and already scrolls a long way; a future settings page will have
this problem immediately.

**Pattern:** a `<Section>` component — heading, one-line summary, expandable
body, remembers its state per section in `localStorage`. Default expanded when
something inside needs attention, collapsed when healthy. That last rule is the
important one: it makes the page's shape carry information.

### B5 · A right-hand contextual panel for tools and guidance

**Reference:** a collapsible right rail with *Tools* — Status Dashboard,
Transfer tool, Marketplace — plus a dismissible suggestion card ("Enable
advanced mobile management", **LEARN MORE** / **SKIP**).

**Why it works:** secondary actions stay reachable without competing with the
page's primary content, and suggestions are dismissible rather than permanent.

**Here:** `live` already has a two-column split with the activity feed on the
right, which is the same idea arrived at independently. Worth generalising: a
standard right rail slot the layout provides, so any page can put context there
and it lands in the same place every time.

### B6 · An onboarding / readiness checklist with visible progress — *done*

**Reference:** *"Next in onboarding — 0/9"*, collapsible, with the current step
expanded and an action button on it.

**Why it works:** it turns "is this system ready" from tribal knowledge into a
list, and the fraction makes progress legible.

**Here:** this maps almost too neatly onto the launch blockers. The panel knows
most of them: `invoice.service.configured` is false without a GSTIN, the push
provider is unconfigured, Razorpay is unconfigured, the agreement is still the
seeded placeholder, S3 is unset. Today that knowledge is spread across
`.env.example`, `context.md` and the monitoring page.

**Built.** `GET /admin/readiness` returns one row per requirement computed from
live configuration and data, plus `/readiness` grouping them into blocking,
degraded and ready.

The **blocking versus degraded** split is the load-bearing part. A checklist
that treats "no masked calling" the same as "no GST registration" is one nobody
finishes reading, so the headline is the blocker count rather than a passing
count — 3/9 invites relief, "5 blockers outstanding" does not.

Reads `03AAAAA0000A1Z5` on the current config and calls it a placeholder. That
is a **heuristic**, not validation: a GSTIN's format cannot distinguish a dummy
from a registration, which is precisely why BUG-A01 survived. It looks for the
giveaways in the PAN portion — five identical letters, `ABCDE`, or the digit
runs `0000`/`1234` — and reports "looks like a placeholder", never "invalid",
because the remedy either way is a human looking at it. Six tests pin it.

**What it cannot see**, stated on the page itself: whether a real GSTIN belongs
to the right entity, or whether agreement text has actually been through
counsel. It detects the *seeded* placeholder marker, so arbitrary unreviewed
text passes.

### B7 · Destructive flows get a page with prerequisites, not a modal

**Reference:** "Delete Mioryde's Google Account" is a full page with numbered
steps — *1. Save invoices and transaction history*, *2. Save data for users* —
each with the exact figures (0 bytes storage) and a link to the tool that does
it. The irreversible button is at the end, after the consequences.

**Why it works:** it makes the operator do the reversible preparation before
offering the irreversible act, and it states the blast radius in numbers rather
than adjectives.

**Here:** the closest equivalent is `agreement`, which already does something
similar well — it makes you type the version number, and it tells you how many
partners will be stood down. That instinct is right and should be the house
pattern for anything irreversible: publishing terms, deactivating an admin,
issuing a credit note, and (when it exists) a refund.

**Pattern:** `<DestructiveFlow>` — numbered prerequisites, a live statement of
consequence pulled from the server ("this will stand down 34 partners", "this
credits ₹583.48 and cannot be reversed"), typed confirmation for the worst
cases, and the action last.

### B8 · Utility cluster in the header, in a fixed order

**Reference:** notifications bell, activity/history, help, apps grid, account
avatar carrying a status badge — same position on every page, and the avatar's
badge is how you learn something is wrong with your account.

**Here:** the header has name, role and Sign out. The name now links to
`/security` (added this session). There is no notification surface, no help
affordance, and no status indication anywhere in the chrome.

**Pattern:** keep the cluster small and honest — a notifications button that
opens recent `admin_events` and unread attention items, and the account menu.
Do not add an apps grid; there are no other apps.

The theme switcher currently lives in the sidebar footer
(`Sidebar.tsx:279`), which is a defensible home and collapses with the rail.
Leave it there rather than moving it into the header for symmetry with the
reference — it is a preference, not a utility, and it is findable where it is.

### B9 · Skeletons that match the real layout

**Reference:** the console's loading state is grey blocks in the exact shape of
the content that will land — visible in the dashboard screenshots.

**Here:** already done, and done well. `SkeletonRows` matches the 52px row
height deliberately, and the overview's `Stat` reserves the exact height of the
real value so the grid does not jump. This is a pattern the panel already has
right; the note is to keep it when adding pages, and to extend it — the
analytics charts and the monitoring cards currently fall back to
`SkeletonRows`, which is the wrong shape for both.

### B10 · Persistent feedback affordance

**Reference:** "Send feedback" pinned bottom-left of the nav on every page.

**Here:** worth adding, pointed at whatever you and Divyam actually read. An
internal panel with four operators produces its best bug reports from the
people using it, and only if reporting takes one click.

---

## Part C — Frontend platform work

Things the component library needs before the pages above can be built cleanly.

### C1 · A toast / notification system

There is none — verified: no `toast`, `Toast`, `Dialog`, `Modal` or `<dialog>`
anywhere in `src/`. Every page invents its own success and error rendering:
`security` uses a `role="status"` paragraph, `access` puts errors inside the
row, `analytics` uses a `Card`, `live` uses a bare `<p role="alert">`.

The result is that the same event looks different depending on where you are,
and a success that happens after navigation is simply lost.

**Pattern:** one `ToastProvider` in the panel layout, `useToast()` for pages.
Toasts carry a tone, a sentence, and optionally one action ("Undo", "View").
`role="status"` for success, `role="alert"` for failure. Auto-dismiss success
after ~5s; never auto-dismiss an error.

### C2 · A dialog primitive

Needed for B7 and for the several places already doing ad-hoc inline
confirmation (`access/page.tsx:283` toggles a `confirmingReset` boolean and
swaps buttons in place). Build on native `<dialog>` so focus trapping, Escape
and the backdrop come from the platform rather than from us. Requirements:
returns focus to the trigger on close, labelled by its heading, and no
scroll-lock bug on the body.

### C3 · A real data-table component — *built*

Five pages hand-roll grid tables (A6) with the column widths duplicated in two
places each — the header `div` and the row `li` — which is why the column
definitions in `live/page.tsx` appear twice and must be kept in sync by hand.

**Pattern:** `<DataTable columns={...} rows={...} />` — one column definition
carrying width, alignment, header label and cell renderer; emits a real
`<table>` with `<th scope="col">`; handles empty, loading and error states;
supports optional sort and row click. This removes the duplication, fixes the
semantics for all five pages at once, and is the prerequisite for A1's
pagination controls being consistent.

### C4 · Stop `Input` opting out of the global focus ring

This is already solved for everything except inputs — see the corrected A5. The
whole of C4 is: delete `focus:outline-none` from `Input` in `ui.tsx`. Do **not**
add per-component `focus-visible:` utilities; the base rule already covers every
primitive and duplicating it is how the two drift apart.

### C5 · URL as the source of truth for view state

Fix A3 and A4 with one pattern: a `useUrlState` hook wrapping
`useSearchParams` + `router.replace`, so filters, search, page and range read
and write the query string. `replace` rather than `push` for keystrokes, so
typing a search does not fill the history stack.

Once this exists the overview's drill-through links work, views become
shareable, and back behaves.

### C6 · An `ErrorBoundary`, `not-found` and per-route `loading`

Fix A7. The error boundary must render inside the panel chrome so the operator
keeps their navigation, show the message, and offer both retry and a link to
the overview. Given BUG-038's history, it should also state plainly that the
panel failed rather than showing an empty region.

### C7 · Density and typography audit

Some concrete inconsistencies to resolve while touching these files: font
sizes in use across pages include `text-[9px]`, `[10px]`, `[11px]`, `[12px]`,
`[13px]`, `text-xs`, `text-sm`, `text-2xl` and `text-[28px]`. That is nine
sizes, several of which differ by one pixel and are chosen ad hoc. Reduce to a
named scale in `globals.css` (`--text-micro`, `--text-meta`, `--text-body`,
`--text-title`, `--text-figure`) and use it. The tokens for colour are already
well-organised and light/dark are both defined properly — this is the one
dimension of the design system that is not.

---

## Part D — Backend work

### D1 · Pagination metadata on every list endpoint

Prerequisite for A1. Each list query should return
`{results, page, pageSize, total, hasMore}`. Use a windowed
`count(*) OVER ()` in the same query rather than a second round trip, so the
count cannot disagree with the page. Where a table may grow large enough that
an exact count is expensive, return `hasMore` from fetching `pageSize + 1` rows
and say "25+" rather than lying with a stale number.

### D2 · A cross-entity search endpoint

`GET /admin/search?q=` backing B2. Dispatch on the shape of the query rather
than searching everything: order code, phone, email, name. Return a small,
uniform `{type, id, label, detail, href}` so the palette does not need to know
about each entity type. Rate-limit it — it is the one endpoint a typing user
hits per keystroke, so debounce on the client *and* throttle on the server.

### D3 · Order detail

Fix A2. `GET /admin/orders/:id` returning the order, its full
`order_events` timeline with actor names resolved, the assigned partner, the
payment and invoice state, any credit notes, and the ratings. Then a
`/orders/[id]` page. Everything is already in the schema.

Include the track polyline only behind a separate call — it is the largest part
of the payload and is only wanted when somebody opens a map.

### D4 · Customer detail — *done*

`GET /admin/customers/:id` and `/customers/[id]`: order history, wallet balance
and recent entries, saved-address count, lifetime value, cancellation rate, and
the repeat/new classification — defined identically to the analytics one, so the
two screens cannot disagree about what "returning" means.

The wallet balance is read from the newest entry's `balance_after`, never
summed. That column is computed under a row lock at insert time precisely so
nobody recomputes it.

Read-only on purpose: there are no customer actions on the server (D6), and
buttons that 404 teach operators to ignore errors.

**Verified** against the dev database and in a browser: a customer with 9
orders reads ₹229.34 lifetime, a 22% cancellation rate and a ₹74 wallet with
signed entries; a customer with none reads "—" for the rate rather than 0% or
NaN, "Never used" for the wallet, and shows no wallet card at all. The
customer → delivery → customer round trip closes.

Written while Docker was down, so it was committed unverified and checked
afterwards. What static column-checking caught first: `organizations` has no
`name` column, only `legal_name` — a 500 identical to the `goods_category` one,
found before it ever ran.

### D5 · Wire up what already exists

- `GET /admin/riders/:id/history` exists and, per `context.md` §5, has no UI.
  It is verified server-side; it needs a tab on the partner detail page.
- `CreditNoteService` (added this session) has no controller and no UI. Even
  before refunds are decided, `GET /admin/orders/:id/credit-notes` and a
  read-only display belong on the order detail page.

### D6 · Actions the panel cannot take — *two of five built*

There were no admin write endpoints for orders at all. Two now exist, and the
other three are deliberately not built:

**Built.** *Cancel a delivery* and *block or restore a customer*, both
operations-only, both audited, both requiring a reason in the destructive
direction.

The cancel carries one judgement worth knowing about: **it refuses an order
that has already been paid.** Cancelling a prepaid, paid delivery means the
customer has handed over money for something that will not happen — an
obligation the platform then owes them, and refunds do not exist to discharge
it. Cancelling anyway would leave money in limbo with nothing recording that it
is owed, which is exactly how a customer ends up chasing support for a refund
nobody knows about. COD is unaffected: no money has moved.

It also refuses once the parcel is `picked_up`. Flipping a row to `cancelled`
does not get goods back to the sender and strands the partner mid-job with no
instruction — that is a recovery involving two people and a physical object,
and a button would make it look like a status change.

**Not built, and why:**

- **Reassign a stuck delivery.** Touches the dispatch invariants — the unique
  accepted-offer index exists precisely to stop two partners holding one job —
  and getting it wrong double-assigns a delivery. Needs designing, not typing.
- **Adjust a fare.** Downward is a credit note, which now exists. Upward is a
  debit note, which does not. Half an operation is worse than none.
- **Refund.** Still the three business decisions in `context.md`.

### D7 · Notification settings

Nothing configures notifications today; the templates and the outbox are
hardcoded. A `notification_settings` table keyed by topic, with per-channel
toggles and quiet hours, plus an admin page. Low urgency until push actually
works (Firebase is unconfigured), but it is on the roadmap and the shape is
small.

### D8 · Pricing is a read-only page over a writable endpoint — *fixed*

Confirmed: `pricing/page.tsx` calls `api.rateCards()` and contains **zero**
buttons, click handlers or form submissions — it renders the fare table and
nothing else. Meanwhile `POST /admin/rate-cards` exists on the server and
`permissions.ts` already defines a `pricing.edit` capability, granted to owner
and finance, which currently gates only the agreement page.

So the capability, the role grant and the endpoint all exist, and the UI to use
them does not. Fare changes are a SQL insert today.

`GET /admin/zones` and `GET /admin/vehicle-types` have no write counterpart at
all, so launching a new city is also a manual insert.

**Fixed for rate cards.** `components/RateCardEditor.tsx`, reached from a Change
action on every row and gated on `pricing.edit`. Three things worth knowing:

- **It publishes all six numbers at once**, matching the server, which
  supersedes rather than edits. Saving a per-km rate on its own would leave the
  live fare in a state nobody chose for the seconds in between.
- **The preview is computed by the server**, through `FareCalculator` — the same
  code that prices a customer's quote — via a new `POST /admin/rate-cards/preview`
  that reads and writes nothing. Adding the fare up in the browser would be a
  second implementation of the formula, and a preview that drifts is worse than
  none, because it keeps looking authoritative. The old fare is shown beside the
  new one for a sample trip: "₹98.65 → ₹87.32", not "this changes pricing".
- **Rupees become paise as text**, never `Math.round(Number(x) * 100)` —
  `lib/rupees.ts`, with tests pinning `1.15` and `8.7`, both of which a float
  gets wrong.

Also fixed while here: the server returned its one fare-ordering validation as a
`NotFoundException`, so a base fare above the minimum answered 404 and sent the
operator looking for a missing zone.

Zones and vehicle types still have no write UI. `POST /admin/vehicle-types`
exists and nothing in the panel calls it.

### D9 · Export beyond one CSV — *fixed*

`analytics/daily.csv` was the only export. The pattern it established (BOM,
`Content-Disposition`, `Access-Control-Expose-Headers`) now lives in
`common/csv.ts` and carries four more — payouts, collections, the audit log and
the partner leaderboard — each filtered the same way the screen it was taken
from is. `components/ExportButton.tsx` is the one caller-side implementation of
the token fetch and the object-URL dance.

Two things the shared helper adds that a table of dates and numbers never
needed:

- **Quoting.** A partner named `Kumar, R.` split into two columns and shifted
  every column after it — silently, in a file whose purpose is to be summed by
  somebody who was not there when it was produced.
- **Formula neutralisation.** A cell beginning `=`, `+`, `-` or `@` is executed
  by Excel when the file is opened, and a payout note is operator-supplied text.
  A test caught the obvious over-correction: `-42.00` is a number, and prefixing
  it turns a money column into text that sums to zero.

The partner's phone number is **masked** in the payouts export, as it is
everywhere else in the panel — an export leaves the building and records nothing
about who read it. The masking happens in the query handler rather than in the
export, so the two cannot disagree; see D11.

### D11 · The payouts page printed unmasked partner phone numbers — *fixed*

**Found while building D9.** Every other admin surface masks a phone and makes
revealing one an audited action — `/riders` returns `maskPhone(...)` and
`POST /admin/riders/:id/reveal-phone` writes an audit row. `GET /admin/payouts`
returned `(r.phone_cc || r.phone)` in full and `payouts/page.tsx` rendered it
beside the amount, so the one screen finance lives on was also the one screen
where a partner's number could be read, copied and screenshotted without a
trace.

**Fixed in `list()`,** so the CSV export cannot un-mask it either — it now takes
the already-masked value, because `maskPhone` is not idempotent: a second pass
does not recognise the shape, fails closed, and blanks the column. The page uses
the same `RevealPhone` control as `/riders`, `/live` and the partner detail page.

**The reveal route now accepts `finance` as well as `ops`, and that is a
tightening.** Finance already read every number at will; they now go through the
audited door, or they could not do the job the masking interrupted. Support is
still refused — verified live, 403 on both the reveal and the payouts list.

`test/admin-phone-masking.test.ts` reads the source and fails if any admin list
handler assigns a `phone` field that is not built by `maskPhone`. Confirmed to
fail when the mask is removed, rather than being a test that asserts nothing —
this is invisible to a typecheck, since the field is a string either way.

### D10 · Reconciliation

Named as not-built in `context.md`: gateway ↔ ledger reconciliation. The
monitoring page now checks the ledger against itself, which is the internal
half. The external half — does what Razorpay says it settled match what the
ledger says it received — is the one that catches a real loss. Blocked on
Razorpay credentials, but the job can be written against the ledger side now.

---

## Part E — Accessibility

Beyond A5 and A6, which are the two that matter most:

- **Skip link.** One anchor before the nav, jumping to `<main>`. Fifteen nav
  items before content on every page is otherwise the keyboard experience.
- **Landmarks are present** (`<header>`, `<nav>`, `<main>` in the panel layout)
  but unlabelled. Give the nav an `aria-label` so a screen reader can
  distinguish it from any future nav.
- **Live regions are inconsistent.** Ten `role="status"` / `role="alert"` /
  `aria-live` occurrences across the whole app, mostly added ad hoc. C1's toast
  system should own this so it is right by default.
- **The dispatch board updates silently.** Rows appear, move and disappear with
  no announcement. A polite live region announcing "3 deliveries need
  attention" on change would make it usable without sight.
- **Colour is load-bearing in places.** The amber flag on the dispatch board
  pairs colour with a `⚑` glyph, which is right; the monitoring page's amber
  numbers do not pair with anything. Every state signalled by colour needs a
  second channel.
- **Contrast needs measuring, not eyeballing.** `--fg-faint` is `#808080` on
  `#000000` in dark mode (about 5.3:1, passes for body text) but the panel uses
  it at `9px` and `10px` in several places where it is doing real work. Small
  text at low contrast is the most common failure in dark UIs.
- **Reduced motion is already handled** — `globals.css:357` zeroes animation and
  transition durations under `prefers-reduced-motion: reduce` and disables
  smooth scrolling. Nothing to do; do not remove it.

---

## Part F — Things that are already right

Worth recording so they are not "cleaned up" by someone later.

- **Server-side PII masking** with an audited reveal (`RevealPhone`,
  `pii.ts`). The reasoning in `pii.ts` about why client-side masking is not
  masking is correct and worth keeping verbatim.
- **The role mirror** in `permissions.ts`, including its own warning about
  drift and the `handleForbidden` message that turns a 403 into an explanation.
- **Skeletons sized to real content** (B9).
- **Hand-written SVG charts** rather than a charting library, with labelled
  axes, zero hairlines and hover readouts — all of which were added because
  their absence was noticed with real data.
- **Light and dark both fully defined** as token sets, including a
  `light-dark()` path. Most projects have one theme and a hopeful second.
- **The typed-confirmation pattern** on agreement publishing.
- **`prefers-reduced-motion` is respected** (`globals.css:357`), which is rare
  in a UI with this much motion in it.
- **Themed scrollbars** and a grain overlay tuned per theme — small, and the
  kind of detail that makes a panel feel deliberate.

---

## Part G — The order I would do this in

Each step is independently shippable and leaves the panel better than it found
it. Earlier steps unblock later ones.

**1 — Stop lying to the operator.** A1 + D1 (pagination with real totals), then
A3 + C5 (URL state, which fixes the dead drill-through links). These are the
two places the panel currently shows something false: a truncated list
presented as complete, and a link that appears to filter and does not.

**2 — The platform pieces.** C1 toast, C2 dialog, C4 focus rings, C6 error and
404 boundaries. Small, and every later item depends on them. C4 is an
afternoon and closes an accessibility defect.

**3 — Order detail.** D3 + A2. The largest functional gap, entirely
unblocked, and the thing support needs most.

**4 — C3 data table**, applied to the five grid pages. Fixes A6 semantics,
removes the duplicated column definitions, and standardises pagination from
step 1 across every list at once.

**5 — B1 banners + B6 readiness.** Together these turn the panel into something
that tells you what is wrong instead of waiting to be asked. B6 in particular
replaces a launch checklist that currently lives in three documents.

**6 — B2 global search** (needs D2). High daily value once detail pages exist
to search *to* — which is why it comes after step 3 rather than before.

**7 — Polish.** B3 breadcrumbs, B4 collapsible sections, C7 type scale, A8/A9
convention and comment fixes, Part E accessibility sweep, A10 responsive pass.

**8 — Then the roadmap features** — D4 customer detail, D5 wiring up what
exists, D6 order actions, D7 notification settings, D8 zone management,
D9 exports, D10 reconciliation.

---

## Appendix — verification notes

Claims in Part A were checked as follows, so they can be re-checked:

| Claim | How |
|---|---|
| A1 pagination | `grep -rn "setPage" src/app` → only `audit/page.tsx`; `grep "pageSize = "` in api → 11 queries |
| A1 no totals | Every list handler returns `{results}`; no `count(*) OVER` in any admin query |
| A2 no order detail | Full route list from the API boot log — no `GET /admin/orders/:id` |
| A3, A4 URL state | `grep -rn "useSearchParams\|searchParams" src/` → zero matches |
| A5 focus | ~~`grep -n "focus:" ui.tsx`~~ — **wrong method, gave a wrong answer.** Use `grep -oE ":focus-visible\{outline[^}]*\}" .next/static/chunks/*.css` → the base rule is present |
| A6 fake tables | `grep -rln "grid-cols-\[" src/app` → 5 pages; `<table>` → 2 pages |
| A7 boundaries | `ls src/app` — no `error.tsx`, `not-found.tsx`, `loading.tsx` |
| A8 PageHeader | Per-file grep across all 15 pages → 2 missing |
| A9 stale comment | `outbox.worker.ts:53` logs "Outbox worker started"; observed publishing live |
| A10 responsive | `grep -roh "\b(sm\|md\|lg\|xl):"` → 10 / 0 / 8 / 1 |
| A11 keyboard | `grep -rn "onKeyDown\|Escape"` → zero matches |
| D8 pricing read-only | `grep -cE "<button\|onClick"` on `pricing/page.tsx` → 0 |

**One caution for whoever re-runs these.** A bare `grep "api\."` undercounts:
several pages write the call across two lines (`api` then `.orders({...})` on
the next), so `orders/page.tsx` and `pricing/page.tsx` both report zero API
calls while clearly making them. Match on the method name, not on `api.`.

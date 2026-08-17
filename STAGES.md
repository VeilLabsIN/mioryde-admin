# Admin panel — refinement stages

Execution plan for the work identified in `PATTERNS.md`, split by aspect so each
stage is independently shippable and reviewable. `PATTERNS.md` says *what is
wrong and why*; this says *in what order, and what "done" means*.

**Rule for every stage:** it must build, typecheck, pass tests, and be looked at
in a browser before it is called finished. A stage that only satisfies the first
three is not done — that is how BUG-038 shipped.

**Status key:** ✅ done · 🔨 in progress · ⬜ planned

**Verified so far (browser, production build, signed in as owner):** all six type
tokens resolve with their intended size, tracking and weight; the skip link and
the labelled nav landmark are present; a real deactivate/reactivate produced a
`role="status"` toast that auto-dismissed within 6s; a row-specific refusal
stayed inline and produced no toast, which is the intended split; the 404 page
renders with the new type scale.

**Not yet verified:** the error *toast* path has no caller — `access` routes
failures to the row deliberately, so `toast.error` is implemented and unexercised
in situ. The `error.tsx` boundary has not been made to fire. `Card` tones and the
new skeletons are built but not yet adopted by any page.

---

## Stage 1 · Typography ✅

**Problem.** Nine ad-hoc font sizes in use — `text-[9px]`, `[10px]`, `[11px]`,
`[12px]`, `[13px]`, `text-xs`, `text-sm`, `text-2xl`, `text-[28px]` — several
differing by a single pixel, chosen per-file. Two pages disagreed on their
heading treatment for the same reason before `PageHeader` existed.

**Done means.** A named scale in `globals.css`, exposed to Tailwind, with each
step having a stated job. Arbitrary bracket sizes stop being added.

| Token | Size / tracking | Job |
|---|---|---|
| `text-micro` | 9px, +2px tracking, uppercase | Column headers, `SectionLabel` |
| `text-meta` | 11px | Hints, secondary row detail, timestamps |
| `text-body` | 13px | The panel's real body size — most content |
| `text-label` | 15px | Card headings, emphasised rows |
| `text-title` | 24px | `PageHeader` only |
| `text-figure` | 28px, tabular | Dashboard and monitoring numbers |

Kept deliberately: `font-mono` for anything that is a code, an id, an amount or
a duration. Proportional digits in a column of money is the single most common
way a table stops being scannable.

---

## Stage 2 · Motion and transitions ✅

**Problem.** Durations were already tokenised (`--dur-fast/base/slow`) and
easings existed, but components mostly hardcoded `duration-150`. Nothing
distinguished *entering* from *changing* from *leaving*, so everything moved at
the same speed and the interface had no sense of hierarchy.

**Done means.** A small motion vocabulary, honest about what it is for:

- **Enter** (`--dur-base`, `ease-out-quint`) — content arriving. Fade plus a 4px
  rise, never a slide from off-screen; a row that flies in from the left implies
  it came from somewhere.
- **Change** (`--dur-fast`) — hover, focus, colour, a value updating in place.
  Fast enough to feel like a response rather than an animation.
- **Leave** (`--dur-fast`) — always quicker than entering. Waiting for something
  to finish disappearing is the most irritating kind of latency.
- **Attention** (`--dur-slow`, looped) — the live pulse, and nothing else.

All of it `transform` and `opacity` only, so it stays on the compositor. The
existing `prefers-reduced-motion` block already neutralises the lot.

---

## Stage 3 · Surfaces, containers and depth ✅

**Problem.** One `Card` for every purpose. A card holding a warning, a card
holding a table and a card holding a form were visually identical, so the page
had no read order — everything was equally loud.

**Done means.** `Card` gains a `tone` and the surface tokens gain a third level,
so importance is expressed by the container rather than by making text bigger.

- `tone="default"` — the existing surface. Most things.
- `tone="raised"` — a level up, for the primary object on a detail page.
- `tone="inset"` — a level down, for nested detail inside a card.
- `tone="critical" | "warning" | "ok"` — a coloured left edge and a matching
  border, for a container whose *contents* are the alarm. The monitoring page
  already improvised this with `border-warn`; this makes it the pattern.

The brand `corner-cut` clip stays on every card — it is the one thing tying the
panel to the marketing site.

---

## Stage 4 · Loading and skeletons ✅

**Problem.** `SkeletonRows` is shaped like a table row, and three pages that are
not tables used it anyway — the monitoring cards and the analytics charts both
render a stack of 52px bars while loading and then something completely
different. The jump is worse than a spinner.

**Done means.** Skeletons that match what is coming: `SkeletonRows` for lists,
`SkeletonCard` for metric grids, `SkeletonChart` for charts. Plus the rule that
made the existing ones good — reserve the *exact* final height, so nothing
reflows when data lands.

---

## Stage 4b · Boundaries ✅

Not in the original list, but it belongs with loading states: the panel had no
`error.tsx` and no `not-found.tsx`, so an unhandled render error was a blank
region — BUG-038's exact symptom — and a mistyped URL lost the operator their
navigation entirely.

`(panel)/error.tsx` is scoped to the segment so the sidebar and header survive,
shows the real message and the digest that ties it to a server log line, and
offers both retry and a way out. It says the panel failed rather than "something
went wrong", because the softer phrasing invites the operator to assume they
caused it and retry the same action.

`not-found.tsx` sits at the root and deliberately does **not** render the rail:
a root-level not-found is outside the `(panel)` layout, and that layout is where
the session check lives, so showing navigation there would mean rendering it for
a possibly unauthenticated visitor.

---

## Stage 5 · Notifications ✅

**Problem.** No toast, dialog or notification primitive exists. Five pages each
invented their own success and error rendering, so the same event looks
different depending where you are, and any result that arrives after navigation
is lost entirely.

**Done means.** One `ToastProvider` in the panel layout; `useToast()` for pages.

- Success: `role="status"`, auto-dismisses after 5s.
- Failure: `role="alert"`, never auto-dismisses — an error the operator did not
  see is an error that did not happen.
- Optional single action ("Undo", "View order").
- Stacks, capped at three, oldest evicted.
- Sits above `<main>` so it survives a page change.

**What toasts are not for.** Inline errors are still correct in places and this
does not replace them. A validation message belongs beside its field, and the
access page's per-row refusal ("you cannot change your own role") belongs on
that row — it is about *that account*, and moving it to a corner of the screen
would make it harder to act on, not easier. Toasts are for the outcome of an
action; inline is for the state of a thing. `access` now does both: success goes
to a toast because the row may have re-sorted by the time the reload lands,
failure stays on the row.

---

## Stage 6 · Inline paging ✅

**All eleven lists converted.** Deliveries, customers, partners, payouts, the
three KYC queues, collections, bank checks, the audit log and rider history all
return `{results, page}`, and every list with a UI has a `<Pager>`.

**The audit log deliberately uses the probe form**, not `count(*) OVER ()`. The
page already carried a note saying that counting an append-only log on every
view is a full scan and the number is not worth it — that reasoning was correct,
so `pagedByProbe` fetches one extra row instead and the readout says "50+".
`Pager` treating a null total as *unknown* rather than zero is what makes that
work.

**Rider history** shares `auditLog()`, so it has paging already; it still has no
UI (`context.md` §5). Do that with the partner detail tab.

**Found while finishing this:** the audit log endpoint had never worked at all —
a `text = uuid` cast that fails at plan time, so every call was a 500. See
BUG-044. The page has existed since audit logging shipped and had never
displayed a row.

`common/paging.ts` carries the shared shape: `totalCount` (a `count(*) OVER ()`
fragment selected alongside the page's own columns) and `pagedResponse` /
`pagedByProbe` to build the envelope. The window function rather than a second
`SELECT count(*)` because two round trips can disagree — a row inserted between
them makes the count describe a set the page was not drawn from.

**A real bug found while verifying.** With 27 customers, `?page=2` returned
`total: 0`, because `count(*) OVER ()` attaches its result to each returned row
and an empty page therefore carries no count. Read naively that says "no
customers" for a set that has twenty-seven — the same class of lie this stage
exists to remove. `PageMeta.total` is now nullable and means *not determinable*,
never zero, with a separate `beyondEnd` flag the client uses to recover to page
one. Nine tests pin the arithmetic, including the off-by-one where 25 of 25 must
not offer a next page while 25 of 50 must.

**Verified in a browser** against the 27 real customers: page one read
"1–25 of 27" with Previous disabled, page two "26–27 of 27" with Next disabled
and the two rows that were previously unreachable in the panel; a no-match
search showed "0 customers" with no pager; and deliveries, at 16 rows, showed
no pager at all.

### Original scope, for the remaining eight

**The functional one, and the highest priority in this file.** Every list page
except the audit log is capped at 25 rows with no indication (see `PATTERNS.md`
A1). Needs the backend first: no list endpoint returns a total.

- **Backend** — every list handler returns `{results, page, pageSize, total,
  hasMore}`, with `count(*) OVER ()` in the same query so the count cannot
  disagree with the page it describes.
- **Frontend** — one `<Pager>` used by every list: "26–50 of 340", previous and
  next, disabled at the ends, and the page number in the URL so a view is
  linkable (needs Stage 8).
- **Empty vs truncated** must read differently. "Nothing matches" and "showing
  the first 25 of 340" are different facts and currently look the same.

---

## Stage 7 · Sidebar ⬜

Already good — grouped, collapsible, a single sliding indicator, theme switcher
in the footer. Remaining:

- Sections do not collapse individually; with a sixth group the rail will need
  it.
- No keyboard shortcut to focus navigation, and no skip-link past it (15 items
  before content on every page).
- Active state is the indicator only; the label itself does not change weight,
  so at a glance the current page is a colour rather than a word.
- Fixed width, no responsive behaviour below `lg`.

---

## Stage 8 · URL as view state 🔨

**Done for deliveries, customers and partners.** `useUrlParam` and `useUrlPage`
in `lib/useUrlState.ts`; filters, search and page number are in the query
string, so those views are linkable and bookmarkable.

**Not `useSearchParams`,** and the reason is written into the hook: a client
component reading it in a statically prerendered route must sit under a Suspense
boundary or `next build` refuses. Every page here is `"use client"` and
prerendered, so adopting it means a boundary per page and a static-render deopt
each — for a value that only changes on the client, in a panel where nothing
server-side reads the query string. So the hook uses `window.location.search`
plus `history.replaceState`, and listens for `popstate` itself.

**The honest tradeoff.** `replaceState` everywhere means typing in a search box
does not fill the history stack — which was the goal — but it also means the
back button does not step through *page numbers*. Back from page two leaves the
page rather than returning to page one. The better answer is `push` for discrete
actions (page, filter) and `replace` for continuous ones (typing); that is a
follow-up, not shipped.

The first page is omitted from the URL, and empty values are removed rather than
written as `?search=`, so two identical views always produce the same link.
Page numbers are one-based in the URL and zero-based to the API, converted in
one place and covered by five tests.

**Remaining:** payouts, collections, banking, the KYC tab selection, the audit
log filters, and the analytics date range.

---

## Stage 9 · Liveliness ⬜

The panel has real-time data and mostly presents it as static. What exists is
good — the pulsing live dot only pulses on a genuinely open stream, elapsed
times tick every second, the connection badge tells the truth. To extend:

- Values that change should transition rather than snap, so a number moving is
  visible peripherally.
- A row arriving on the dispatch board should enter, not appear.
- Freshness should be visible on every polled page, not just two.
- **Audio for attention only** — see Stage 10.

---

## Stage 10 · Audio ⬜

**Deliberately narrow, and off by default.**

Sound on every click was considered and rejected: a dispatcher uses this for a
whole shift, often in a room with other people, and per-action audio is the
first thing anyone disables. It also carries no information — you already know
you clicked.

What audio is genuinely good for is **an event that needs attention when nobody
is looking at the screen.** So:

| Event | Sound |
|---|---|
| Order placed while the board is open | Short, soft, low |
| Cancellation | Two-tone, distinct from the above |
| Ledger check failed / dead-lettered event | Urgent, and only this one repeats |

Rules: off by default, opt-in per operator and stored locally; a visible
mute control in the header whenever it is on; nothing plays for an action the
operator themselves just took; generated via `WebAudio` rather than shipping
audio files; suppressed under `prefers-reduced-motion`, which is the closest
available proxy for "this user does not want to be startled".

---

## Stage 11 · Backgrounds and texture ⬜

Already better than most: two fixed accent washes, SVG grain tuned per theme,
themed scrollbars, the `hazard` stripe. Costs nothing — one paint at load.

Remaining ideas, none urgent: a faint grid on empty states so a blank region
reads as intentional; the `hazard` stripe reserved for genuinely destructive
areas rather than decoration; a subtle vignette to hold attention on the centre
column at very wide viewports.

---

## Stage 12 · Order detail ✅

The largest functional hole in the panel, now closed. `GET /admin/orders/:id`
plus `/orders/[id]`, reached from the order code in the list.

Five queries rather than one join: an order has many events and many credit
notes, so a single statement would multiply the order's own columns across every
event row and force the caller to de-duplicate.

`PageHeader` gained `breadcrumb` for this (pattern B3), so a page arrived at by
link has a way back up. It is also the first real adoption of the Stage 3 `Card`
tones — the history panel is `raised`, a cancellation is `warning`.

**Found while building it:** `orders.goods_category` does not exist. A later
migration normalised it into `goods_categories` and left `goods_category_id` on
the order, so the first version of the query was a 500. Reading a column list
from migration 0001 is not the same as reading the table.

Still deliberately missing: the GPS track. It needs its own endpoint and a map.

---

## Order

1. **1–5** — foundation and the notification gap. Cheap, and everything later
   sits on them. ✅
2. **6** — inline paging, backend first. The panel currently hides data.
3. **8** — URL state. Repairs the broken drill-through and makes views shareable.
4. **12** — order detail. The biggest thing support cannot do.
5. **7, 9** — sidebar and liveliness.
6. **10, 11** — audio and background polish, once the substance is right.

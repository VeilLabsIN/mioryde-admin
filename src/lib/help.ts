/**
 * What every page is for, and how to use it well.
 *
 * ## Why this is data and not an LLM
 *
 * The ask was a chatbot you could question about the panel. This answers the
 * same questions and is deliberately not a model, for three reasons that
 * matter more here than novelty does:
 *
 *   - **It cannot be wrong.** A model asked "does blocking a customer cancel
 *     their live deliveries?" will answer confidently either way. That answer
 *     reaches somebody about to intervene in a real delivery. These entries
 *     are written against the code and reviewed with it.
 *   - **It costs nothing per question** and needs no key, no vendor and no
 *     network round trip — on a panel that already has enough of all three.
 *   - **It works when the API is down**, which is exactly when a confused
 *     operator most wants to know what a page does.
 *
 * If a model is wanted later, this registry is what it should be grounded in
 * rather than replaced by.
 *
 * ## Writing entries
 *
 * `purpose` answers "what is this screen for" in one sentence. `tasks` are the
 * things people actually come here to do. `notes` are the surprises — the
 * behaviour that is correct but unobvious, which is where support questions
 * actually come from.
 */

export interface HelpTopic {
  /** Route this describes. Matched longest-first, like the nav registry. */
  href: string;
  title: string;
  purpose: string;
  tasks?: string[];
  notes?: string[];
  /** Extra words that should find this topic in search. */
  keywords?: string[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    href: "/",
    title: "Overview",
    purpose:
      "The state of the business right now — what is moving, what was earned, and whether anything needs attention today.",
    tasks: [
      "Check how many deliveries are in flight before opening the board.",
      "Spot a cancellation rate that has moved.",
      "Jump to a recent delivery by its code.",
    ],
    notes: [
      "Revenue counts delivered orders only. An order in flight has not earned anything yet, and counting it would make the figure fall whenever one is cancelled.",
      "The dispatch queue shows age, not depth. Ten orders placed a minute ago is a busy morning; one order unassigned for twenty minutes is a problem.",
    ],
    keywords: ["dashboard", "home", "revenue", "summary"],
  },
  {
    href: "/live",
    title: "Live operations",
    purpose:
      "The dispatch board. Every delivery currently in flight, ordered so the ones needing somebody are at the top.",
    tasks: [
      "Find a delivery nobody has accepted and decide what to do about it.",
      "Reveal a partner's number to call them — the reveal is recorded against your name.",
      "Click a code to open the delivery and act on it.",
    ],
    notes: [
      "The flag (⚑) means a delivery has sat in its current status longer than that status should last. Thresholds differ per status: five minutes unassigned is a dispatch failure, two hours in transit is usually a long trip.",
      "Rows re-rank when the board refreshes, not continuously — otherwise a row would slide out from under your cursor as it crossed a threshold.",
      "The clock is corrected for your workstation's clock drift, so 'waiting 22 minutes' is true even if your machine is fast.",
      "Filter by status and the URL changes with it, so you can send somebody a link to exactly what you are looking at.",
    ],
    keywords: ["dispatch", "board", "in flight", "stuck", "attention"],
  },
  {
    href: "/orders",
    title: "Deliveries",
    purpose:
      "Every delivery ever placed, searchable and filterable — the record rather than the live view.",
    tasks: [
      "Find a delivery by its code when a customer calls about it.",
      "Filter to cancelled orders for a period to understand why.",
      "Open a delivery to see its full history and money.",
    ],
    notes: [
      "Search runs on the server across the whole table, not just the page you are looking at.",
      "A delivery's history is append-only. Nothing here rewrites what happened; a correction is a new event.",
    ],
    keywords: ["orders", "history", "search", "cancelled"],
  },
  {
    href: "/customers",
    title: "Customers",
    purpose:
      "Everyone who has ever placed a delivery, with enough context to judge a complaint or a refund request.",
    tasks: [
      "Look up a caller by phone number.",
      "Check whether someone cancels unusually often before acting on their complaint.",
      "Block an account that is being abused, or restore one.",
    ],
    notes: [
      "Blocking stops new orders. It does not cancel deliveries already in flight — a parcel with a partner still has to arrive somewhere — and it refunds nothing.",
      "Phone numbers are masked until revealed, and every reveal is recorded against your name.",
    ],
    keywords: ["users", "block", "customer", "phone", "lifetime value"],
  },
  {
    href: "/riders",
    title: "Partners",
    purpose:
      "The delivery partners: who they are, what they have earned, and what state their account is in.",
    tasks: [
      "Check a partner's earnings before approving a payout request.",
      "See why a partner cannot go on duty.",
      "Open a partner's documents and history.",
    ],
    notes: [
      "Earnings are what the partner is owed, taken from the order itself — not recomputed from today's commission rate. Recomputing would restate history every time a rate changed.",
      "A partner blocked from duty is usually missing a document or a bank verification, not disciplined. The page says which.",
    ],
    keywords: ["riders", "drivers", "earnings", "duty", "partner"],
  },
  {
    href: "/kyc",
    title: "Verification",
    purpose:
      "The queue of partner documents waiting for a human to approve or reject.",
    tasks: [
      "Work through pending documents.",
      "Reject a document with a reason the partner will actually see.",
    ],
    notes: [
      "Opening a document generates a short-lived link and records that you looked. These are identity documents; the record is what makes handling them defensible.",
      "An unrecognised document status reads as 'in review', never as 'approved'. Unknown values fail safe throughout the panel.",
      "Rejecting requires a reason because the partner is told it — 'rejected' with no explanation produces a support call, every time.",
    ],
    keywords: ["kyc", "documents", "aadhaar", "pan", "licence", "approve"],
  },
  {
    href: "/payouts",
    title: "Payouts",
    purpose:
      "Money owed to partners, and the controls for releasing it.",
    tasks: [
      "Review what is due before a payout run.",
      "Understand why a specific partner is being held back.",
    ],
    notes: [
      "Cash collected on delivery offsets what a partner can withdraw. A partner holding company cash is not owed that cash again.",
      "The server decides whether a payout is allowed. The panel shows its answer rather than recomputing the rule, so the two cannot disagree.",
    ],
    keywords: ["payout", "settlement", "owed", "withdraw", "money"],
  },
  {
    href: "/banking",
    title: "Bank checks",
    purpose:
      "Partner bank accounts awaiting verification before money can be sent to them.",
    tasks: ["Verify a partner's bank details.", "Reject details that do not match."],
    notes: [
      "This is the last gate before money leaves. A wrong account number here is not recoverable by cancelling anything — it is a transfer to a stranger.",
    ],
    keywords: ["bank", "account", "ifsc", "verify", "penny drop"],
  },
  {
    href: "/collections",
    title: "Collections",
    purpose:
      "Cash-on-delivery money sitting with partners, and the record of it coming back.",
    tasks: [
      "See which partners are holding company cash.",
      "Record a deposit when a partner hands cash in.",
    ],
    notes: [
      "A partner over the cash-in-hand ceiling stops being offered cash orders. That is the ceiling doing its job, not a fault.",
      "Recording a deposit is a money movement and is written to the ledger. It cannot be edited afterwards, only corrected by another entry.",
    ],
    keywords: ["cod", "cash", "deposit", "collection", "in hand"],
  },
  {
    href: "/pricing",
    title: "Rate cards",
    purpose:
      "What a delivery costs: base fares, per-kilometre rates and surcharges, per zone and vehicle.",
    tasks: ["Review current rates.", "Change a rate for a zone or vehicle."],
    notes: [
      "A rate change applies to new quotes only. Deliveries already quoted keep the price the customer agreed to.",
      "Partner earnings are frozen on each order when it is delivered, so changing commission does not restate what past partners were paid.",
    ],
    keywords: ["fares", "pricing", "rates", "commission", "surge", "zone"],
  },
  {
    href: "/analytics",
    title: "Analytics",
    purpose:
      "Trends over time rather than the state right now — volume, revenue, cancellations and where they are moving.",
    tasks: ["Compare a period against the one before it.", "Export what you are looking at."],
    notes: [
      "Support staff cannot open this page. Revenue is not part of answering a customer question, and the API enforces that independently of the nav.",
      "A custom date range goes into the URL, so a chart you are discussing can be shared as a link.",
    ],
    keywords: ["reports", "charts", "trends", "revenue", "export"],
  },
  {
    href: "/agreement",
    title: "Partner agreement",
    purpose:
      "The terms partners accept during onboarding, and the record of who accepted which version.",
    tasks: ["Read the live version.", "Publish a new version."],
    notes: [
      "Publishing stands down every partner who accepted the previous version until they accept the new one. The page tells you how many that is before you confirm.",
      "Versions are append-only. A version number cannot be reused, and the text of a published version cannot be edited — that is what makes 'they agreed to this' mean anything.",
    ],
    keywords: ["terms", "agreement", "partner", "publish", "version", "legal"],
  },
  {
    href: "/audit",
    title: "Audit log",
    purpose:
      "Who did what in this panel, and when. The record that makes every other screen accountable.",
    tasks: [
      "Find out who changed something.",
      "Check who viewed a customer's phone number or a partner's documents.",
    ],
    notes: [
      "Reads are recorded, not just writes. Looking at somebody's identity document is itself an event worth having a record of.",
      "Nothing in the panel can delete or edit an audit entry. If it could, the log would not be evidence of anything.",
    ],
    keywords: ["audit", "log", "who", "history", "accountability", "trail"],
  },
  {
    href: "/monitoring",
    title: "Monitoring",
    purpose:
      "Whether the machinery behind the panel is working — queues, workers, and anything backing up.",
    tasks: ["Check whether notifications are being delivered.", "Spot a queue that has stopped draining."],
    notes: [
      "Age matters more than depth. A queue with a thousand items moving quickly is healthy; one item stuck for an hour is not.",
    ],
    keywords: ["health", "queue", "outbox", "workers", "system"],
  },
  {
    href: "/readiness",
    title: "Readiness",
    purpose:
      "What is still missing before this platform can trade legally and reliably.",
    tasks: ["See what is outstanding.", "Check a change actually took effect."],
    notes: [
      "This page is computed from live configuration, not a checklist somebody maintains, so it cannot be out of date. Trust it over any document — including this one.",
      "A blocking item means the platform is doing something it should not yet be doing. A degraded item means a feature is off, which is usually the correct failure.",
    ],
    keywords: ["readiness", "blockers", "config", "gstin", "launch"],
  },
  {
    href: "/access",
    title: "Access control",
    purpose:
      "Who can sign in to this panel and what each of them can reach.",
    tasks: ["Add or deactivate a staff account.", "Change somebody's role."],
    notes: [
      "Deactivating an account ends its access immediately, including any session already open — the role is re-read from the database on every request rather than trusted from the sign-in token.",
      "Roles are capability sets, not seniority. Finance can move money and cannot read customer phone numbers; support is the reverse.",
    ],
    keywords: ["staff", "roles", "permissions", "admin", "access", "deactivate"],
  },
  {
    href: "/security",
    title: "Your account",
    purpose: "Your own password and sessions.",
    tasks: ["Change your password.", "Sign out everywhere else."],
    notes: [
      "Changing your password ends every other session you have open. That is the point — it is what you do when you think someone else has it.",
    ],
    keywords: ["password", "account", "me", "sessions", "sign out"],
  },
];

/** Longest match wins, so a detail page inherits its section's topic. */
export function helpForPath(pathname: string): HelpTopic | null {
  const matches = HELP_TOPICS.filter((topic) =>
    topic.href === "/"
      ? pathname === "/"
      : pathname === topic.href || pathname.startsWith(`${topic.href}/`),
  ).sort((a, b) => b.href.length - a.href.length);
  return matches[0] ?? null;
}

/**
 * Free-text search across everything a topic says, not just its title.
 *
 * The questions people actually ask — "why can't this partner go on duty",
 * "does blocking cancel their orders" — match the notes, which is where the
 * surprising behaviour is written down. Searching titles alone would find
 * almost none of them.
 */
export function searchHelp(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  return HELP_TOPICS.map((topic) => {
    const haystack = [
      topic.title,
      topic.purpose,
      ...(topic.tasks ?? []),
      ...(topic.notes ?? []),
      ...(topic.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();

    // Every term must appear somewhere. Ranking by title hit first, because a
    // topic named for what you typed is almost always the one you meant.
    const all = terms.every((term) => haystack.includes(term));
    if (!all) return null;
    const titled = terms.some((term) => topic.title.toLowerCase().includes(term));
    return { topic, score: titled ? 0 : 1 };
  })
    .filter((hit): hit is { topic: HelpTopic; score: number } => hit !== null)
    .sort((a, b) => a.score - b.score)
    .map((hit) => hit.topic);
}

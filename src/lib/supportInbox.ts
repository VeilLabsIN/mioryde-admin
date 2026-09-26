/**
 * The support desk's view of a conversation, and the small rules the inbox
 * draws from. Pure, so the triage wording is testable without a browser.
 */

export type InboxView =
  | "open"
  | "unassigned"
  | "mine"
  | "waiting"
  | "breached"
  | "escalated"
  | "safety"
  | "resolved";

export type TicketStatus =
  | "awaiting_agent"
  | "awaiting_requester"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface Money {
  minor: number;
  currency: string;
}

export interface AgentTicket {
  id: string;
  number: string;
  category: string;
  orderId: string | null;
  orderCode: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  escalated: boolean;
  /** The first-reply promise, until somebody keeps it. */
  replyBy: string | null;
  answered: boolean;
  /** Past its promise with no reply yet. Computed by the server. */
  breached: boolean;
  csatRating: number | null;
  lastMessageAt: string;
  createdAt: string;
  requesterType: "user" | "rider";
  requesterName: string | null;
  source: "app" | "job_issue" | "sos";
  assignedTo: { id: string; name: string | null } | null;
  goodwill: Money;
  unread: number;
  /** What the signed-in agent may do here — the server's rule, not a guess. */
  control: TicketControl;
}

/**
 * One conversation, one voice (`support-ownership.ts` on the server).
 *
 * The owner replies; colleagues add internal notes. A supervisor, or anybody
 * once the owner has left a waiting customer for 15 minutes, may take over.
 */
export interface TicketControl {
  owner: "none" | "me" | "other";
  ownerAway: boolean;
  canReply: boolean;
  canManage: boolean;
  canTakeOver: boolean;
  canReassign: boolean;
}

export interface DeskAgent {
  id: string;
  name: string;
  role: string;
}

/** The line under the ticket title: whose conversation this is. */
export function ownerText(ticket: Pick<AgentTicket, "assignedTo" | "control">): string {
  const name = ticket.assignedTo?.name?.trim() || "A colleague";
  switch (ticket.control.owner) {
    case "none":
      return "Unassigned — replying picks it up";
    case "me":
      return "You are handling this";
    case "other":
      return ticket.control.ownerAway
        ? `${name} is handling this, but has not answered for a while`
        : `${name} is handling this`;
  }
}

export interface AgentMessage {
  id: string;
  from: "user" | "rider" | "agent" | "system";
  agentName: string | null;
  /** A note between staff. Never reaches the customer or partner. */
  internal: boolean;
  body: string;
  hasAttachment: boolean;
  createdAt: string;
}

export interface OrderContext {
  id: string;
  code: string;
  status: string;
  total: Money;
  refunded: Money;
  paymentMethod: string;
  paymentStatus: string;
  pickupAddress: string;
  dropAddress: string;
  placedAt: string;
  deliveredAt: string | null;
  vehicleName: string;
  goodsCategory: string | null;
  parcelWeightKg: number | null;
  declaredValue: Money | null;
  riderName: string | null;
}

export interface AgentTicketDetail {
  ticket: AgentTicket;
  messages: AgentMessage[];
  order: OrderContext | null;
  previousTickets: number;
}

export type InboxCounts = Partial<Record<InboxView, number>>;

/** The tabs, in triage order. `resolved` last: it is history, not work. */
export const INBOX_TABS: ReadonlyArray<{ view: InboxView; label: string }> = [
  { view: "open", label: "Open" },
  { view: "safety", label: "Safety" },
  { view: "breached", label: "Late" },
  { view: "escalated", label: "Escalated" },
  { view: "unassigned", label: "Unassigned" },
  { view: "mine", label: "Mine" },
  { view: "waiting", label: "Waiting on them" },
  { view: "resolved", label: "Resolved" },
];

/**
 * The topic codes, in words an agent reads at a glance. The server owns the
 * list (`support-topics.ts`); an unknown code falls back to itself with the
 * underscores gone rather than disappearing.
 */
const CATEGORY_LABELS: Record<string, string> = {
  partner_delayed: "Partner late",
  change_details: "Change address/receiver",
  cancel_help: "Cancellation",
  safety: "Safety",
  damaged_or_missing: "Damage / missing item",
  fare_dispute: "Fare dispute",
  payment_issue: "Payment problem",
  refund_status: "Refund status",
  partner_behaviour: "Partner complaint",
  lost_item: "Lost item",
  order_other: "Other (delivery)",
  wallet: "Wallet",
  account: "Account",
  app_problem: "App problem",
  general_other: "Other",
  job_payment: "Job payout",
  job_customer: "Problem with customer",
  job_safety: "Partner safety",
  job_other: "Other (job)",
  payouts: "Payouts",
  documents: "Documents",
  rider_account: "Partner account",
  rider_other: "Other (partner)",
};

export function categoryLabel(code: string): string {
  return CATEGORY_LABELS[code] ?? code.replaceAll("_", " ");
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  awaiting_agent: "Needs reply",
  awaiting_requester: "Waiting on them",
  resolved: "Resolved",
  closed: "Closed",
};

/**
 * How long until — or since — the first-reply promise.
 *
 * Minutes, because the promise is fifteen of them and "0 h" says nothing.
 * Null once somebody has replied: the promise was kept or broken and the clock
 * has nothing more to say.
 */
export function slaText(
  ticket: Pick<AgentTicket, "replyBy">,
  now: number,
): string | null {
  if (!ticket.replyBy) return null;
  const due = Date.parse(ticket.replyBy);
  if (Number.isNaN(due) || now === 0) return null;
  const minutes = Math.round((due - now) / 60_000);
  if (minutes >= 60) {
    return `reply in ${Math.floor(minutes / 60)} h ${minutes % 60} m`;
  }
  if (minutes >= 0) return `reply in ${minutes} m`;
  const late = -minutes;
  return late >= 60
    ? `${Math.floor(late / 60)} h ${late % 60} m late`
    : `${late} m late`;
}

/** What a system event code means, for the thread. */
export function systemText(code: string): string {
  const words: Record<string, string> = {
    opened: "Conversation opened",
    resolved: "Marked resolved",
    reopened: "Reopened by the requester",
    escalated: "Escalated to the grievance officer",
    closed: "Closed",
  };
  return words[code] ?? code;
}

/** Stream topics the inbox reacts to. */
export const SUPPORT_STREAM_TOPICS = [
  "support.ticket.created",
  "support.message.received",
  "support.escalated",
  // A colleague answered, took it, or resolved it: every open screen has to
  // see that at once, or somebody replies into a conversation that moved on.
  "support.reply",
  "support.assigned",
  "support.updated",
] as const;

export function isSupportTopic(topic: string): boolean {
  return (SUPPORT_STREAM_TOPICS as readonly string[]).includes(topic);
}

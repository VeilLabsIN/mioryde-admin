"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Fact,
  GhostButton,
  Input,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { useAdmin } from "@/components/AdminProvider";
import { ApiError, api, formatMoney } from "@/lib/api";
import { TOPIC_ALERTS, noteOwnAction, playAlert } from "@/lib/alertSound";
import {
  type AgentMessage,
  type AgentTicket,
  type AgentTicketDetail,
  type DeskAgent,
  INBOX_TABS,
  type InboxCounts,
  type InboxView,
  STATUS_LABEL,
  categoryLabel,
  isSupportTopic,
  ownerText,
  slaText,
  systemText,
} from "@/lib/supportInbox";
import { useAdminEvents } from "@/lib/useAdminEvents";
import { useAsync } from "@/lib/useAsync";
import { useNow } from "@/lib/useNow";

/**
 * The support desk.
 *
 * Queue on the left, the conversation in the middle, the delivery it is about
 * on the right — the three things an agent otherwise opens in three tabs.
 *
 * Live through the admin event stream: a new ticket or a reply from a customer
 * reloads the queue and, if it is the open one, the thread. There is no
 * polling here — the stream is already connected for the rest of the panel.
 */
export default function SupportInboxPage() {
  const me = useAdmin();
  const [view, setView] = useState<InboxView>("open");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // Zero until the clock subscription is live; `slaText` reads zero as
  // unknown, so the server render and the first client render agree.
  const now = useNow();

  const q = query.trim();
  const inbox = useAsync(
    () => api.supportInbox(view, q || undefined),
    [view, q],
    // Held through a failed refresh: an agent mid-reply should not lose the
    // queue because one request timed out.
    { keepPrevious: true, fallback: "Could not load the inbox." },
  );
  const thread = useAsync(
    () => (openId ? api.supportTicket(openId) : Promise.resolve(null)),
    [openId],
    { enabled: openId !== null },
  );
  // Who a conversation can be handed to. Loaded once; a colleague added
  // mid-shift appears on the next page load.
  const agents = useAsync(() => api.supportAgents(), [], {
    fallback: "Could not load colleagues.",
  });
  const tickets = inbox.data?.results ?? null;
  const counts: InboxCounts = inbox.data?.counts ?? {};
  const detail = openId ? thread.data : null;

  /*
   * Live, through the stream the panel already holds open.
   *
   * The first event seen is a baseline, not news — the same rule the live
   * board uses, so opening the page does not replay the last sound. After
   * that, a support event reloads the queue (and the thread, if it is the
   * open one) and makes the topic's sound; a safety report is always the
   * urgent voice.
   */
  const { events } = useAdminEvents();
  const heard = useRef<string | null>(null);
  const { reload: reloadInbox } = inbox;
  const { reload: reloadThread } = thread;
  useEffect(() => {
    const newest = events[0];
    if (!newest) return;
    if (heard.current === null) {
      heard.current = newest.at;
      return;
    }
    if (newest.at === heard.current) return;
    heard.current = newest.at;
    if (!isSupportTopic(newest.topic)) return;

    const handedToMe =
      newest.topic === "support.assigned" &&
      newest.payload["assignedAdminId"] === me?.id &&
      newest.payload["byAdminId"] !== me?.id;
    const kind =
      newest.payload["priority"] === "urgent"
        ? "urgent"
        : handedToMe
          ? "placed"
          : TOPIC_ALERTS[newest.topic];
    if (kind) playAlert(kind);
    reloadInbox();
    if (openId && newest.payload["ticketId"] === openId) reloadThread();
  }, [events, openId, reloadInbox, reloadThread, me?.id]);

  const refreshBoth = async () => {
    reloadInbox();
    reloadThread();
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Support inbox"
        subtitle="Customers and partners asking for help. Replies reach their phone as a notification."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {INBOX_TABS.map((tab) => (
          <GhostButton
            key={tab.view}
            onClick={() => setView(tab.view)}
            className={view === tab.view ? "border-accent text-accent" : ""}
          >
            {tab.label}
            {counts[tab.view] ? ` · ${counts[tab.view]}` : ""}
          </GhostButton>
        ))}
        <Input
          className="ml-auto max-w-[220px]"
          placeholder="Ticket or delivery code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search by ticket or delivery code"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        <Card className="max-h-[75vh] overflow-y-auto">
          {inbox.error && tickets === null ? (
            <EmptyState title="Could not load the inbox" hint={inbox.error} />
          ) : tickets === null ? (
            <SkeletonRows rows={6} />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="Nothing here"
              hint="New conversations appear the moment somebody asks for help."
            />
          ) : (
            <ul className="divide-y divide-edge">
              {tickets.map((t) => (
                <li key={t.id}>
                  <TicketRow
                    ticket={t}
                    now={now}
                    active={openId === t.id}
                    onOpen={() => setOpenId(t.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {detail ? (
          <Thread
            key={detail.ticket.id}
            detail={detail}
            myId={me?.id ?? null}
            agents={agents.data?.results ?? []}
            onChanged={refreshBoth}
          />
        ) : (
          <Card className="p-6">
            <EmptyState
              title="Choose a conversation"
              hint="Urgent and late ones are at the top of every tab."
            />
          </Card>
        )}

        {detail && <ContextRail detail={detail} onChanged={refreshBoth} />}
      </div>
    </div>
  );
}

function TicketRow({
  ticket: t,
  now,
  active,
  onOpen,
}: {
  ticket: AgentTicket;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const sla = slaText(t, now);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full px-3 py-2 text-left hover:bg-panel ${active ? "bg-panel" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-micro text-fg-faint">{t.number}</span>
        {t.priority === "urgent" && (
          <span className="text-micro font-semibold text-danger">URGENT</span>
        )}
        {t.unread > 0 && (
          <span className="ml-auto rounded-full bg-accent px-2 text-micro text-on-accent-bright">
            {t.unread}
          </span>
        )}
      </div>
      <p className="text-body font-semibold text-fg">{categoryLabel(t.category)}</p>
      <p className="text-micro text-fg-muted">
        {t.requesterType === "rider" ? "Partner" : "Customer"}
        {t.requesterName ? ` · ${t.requesterName}` : ""}
        {t.orderCode ? ` · ${t.orderCode}` : ""}
      </p>
      <p className={`text-micro ${t.breached ? "text-danger" : "text-fg-faint"}`}>
        {STATUS_LABEL[t.status]}
        {sla ? ` · ${sla}` : ""}
      </p>
    </button>
  );
}

function Thread({
  detail,
  myId,
  agents,
  onChanged,
}: {
  detail: AgentTicketDetail;
  myId: string | null;
  agents: DeskAgent[];
  onChanged: () => Promise<void>;
}) {
  const { ticket, messages } = detail;
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function act(run: () => Promise<AgentTicketDetail>) {
    setBusy(true);
    setError(null);
    noteOwnAction();
    try {
      await run();
      await onChanged();
      return true;
    } catch (e: unknown) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    if (await act(() => api.supportReply(ticket.id, text, asNote))) {
      setBody("");
    }
  }

  const closed = ticket.status === "closed";
  const { control } = ticket;
  // Somebody else's conversation: anything typed here is a note to them.
  const notesOnly = !control.canReply;
  const asNote = internal || notesOnly;
  const holder = ticket.assignedTo?.name?.trim() || "a colleague";

  async function takeOver() {
    if (
      !window.confirm(
        `Take this conversation over from ${holder}? The thread will show that you did.`,
      )
    ) {
      return;
    }
    await act(() => api.supportUpdate(ticket.id, { assignTo: myId }));
  }

  return (
    <Card className="flex max-h-[75vh] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
        <div className="mr-auto">
          <p className="text-body font-semibold text-fg">
            {ticket.number} · {categoryLabel(ticket.category)}
          </p>
          <p className="text-micro text-fg-muted">
            {STATUS_LABEL[ticket.status]}
            {ticket.escalated ? " · escalated" : ""} · {ownerText(ticket)}
          </p>
        </div>
        {myId && control.owner === "none" && !closed && (
          <GhostButton
            disabled={busy}
            onClick={() =>
              void act(() => api.supportUpdate(ticket.id, { assignTo: myId }))
            }
          >
            Pick up
          </GhostButton>
        )}
        {myId && control.canTakeOver && !closed && (
          <GhostButton disabled={busy} onClick={() => void takeOver()}>
            Take over
          </GhostButton>
        )}
        {control.owner === "me" && !closed && (
          <GhostButton
            disabled={busy}
            onClick={() =>
              void act(() => api.supportUpdate(ticket.id, { assignTo: null }))
            }
          >
            Return to queue
          </GhostButton>
        )}
        {control.canReassign && !closed && agents.length > 0 && (
          <select
            aria-label="Hand to a colleague"
            value=""
            disabled={busy}
            onChange={(e) => {
              const to = e.target.value;
              if (to) void act(() => api.supportUpdate(ticket.id, { assignTo: to }));
            }}
            className="h-9 rounded-xs border border-edge bg-panel px-2 text-body text-fg"
          >
            <option value="">Hand to…</option>
            {agents
              .filter((a) => a.id !== ticket.assignedTo?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label="Priority"
          value={ticket.priority}
          disabled={busy || !control.canManage}
          onChange={(e) =>
            void act(() =>
              api.supportUpdate(ticket.id, {
                priority: e.target.value as AgentTicket["priority"],
              }),
            )
          }
          className="h-9 rounded-xs border border-edge bg-panel px-2 text-body text-fg"
        >
          {(["low", "normal", "high", "urgent"] as const).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {ticket.status !== "resolved" && !closed && control.canManage && (
          <GhostButton
            disabled={busy}
            onClick={() =>
              void act(() => api.supportUpdate(ticket.id, { status: "resolved" }))
            }
          >
            Resolve
          </GhostButton>
        )}
        {!closed && control.canManage && (
          <GhostButton
            disabled={busy}
            onClick={() =>
              void act(() => api.supportUpdate(ticket.id, { status: "closed" }))
            }
          >
            Close
          </GhostButton>
        )}
      </div>

      {control.owner === "other" && !closed && (
        <p className="border-b border-edge bg-warn/5 px-4 py-2 text-micro text-fg-muted">
          {holder} is handling this conversation. Anything you write here is an
          internal note to them — the customer will not see it.
          {control.canTakeOver
            ? control.ownerAway
              ? " They have not answered for a while, so you can take over."
              : " As a supervisor you can take over."
            : ""}
        </p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <MessageRow key={m.id} ticketId={ticket.id} message={m} />
        ))}
        <div ref={end} />
      </div>

      <div className="border-t border-edge px-4 py-3">
        {error && <p className="mb-2 text-micro text-danger">{error}</p>}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={busy || (closed && !asNote)}
          aria-label={asNote ? "Internal note" : "Reply"}
          placeholder={
            asNote
              ? "Note for the team — the customer never sees this"
              : closed
                ? "Closed — only internal notes"
                : "Reply to the customer"
          }
          className={`w-full rounded-xs border px-3 py-2 text-body text-fg ${
            asNote ? "border-warn bg-warn/5" : "border-edge bg-panel"
          }`}
        />
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-micro text-fg-muted">
            <input
              type="checkbox"
              checked={asNote}
              disabled={notesOnly}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal note
          </label>
          <Button
            className="ml-auto"
            loading={busy}
            disabled={!body.trim() || (closed && !asNote)}
            onClick={() => void send()}
          >
            {asNote ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MessageRow({
  ticketId,
  message: m,
}: {
  ticketId: string;
  message: AgentMessage;
}) {
  const [opening, setOpening] = useState(false);

  if (m.from === "system") {
    return (
      <p className="text-center text-micro text-fg-faint">
        {systemText(m.body)} · {new Date(m.createdAt).toLocaleString()}
      </p>
    );
  }

  async function openPhoto() {
    setOpening(true);
    try {
      // Minted per view and short-lived; opened, never stored. The view is
      // audited on the server, without the link.
      const { url } = await api.supportAttachment(ticketId, m.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  }

  const staff = m.from === "agent";
  const who = staff
    ? (m.agentName ?? "Support")
    : m.from === "rider"
      ? "Partner"
      : "Customer";
  return (
    <div className={`flex ${staff ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-sm border px-3 py-2 ${
          m.internal
            ? "border-warn bg-warn/5"
            : staff
              ? "border-accent/40 bg-accent/5"
              : "border-edge bg-panel"
        }`}
      >
        <p className="text-micro text-fg-faint">
          {m.internal ? "Internal note · " : ""}
          {who} · {new Date(m.createdAt).toLocaleTimeString()}
        </p>
        {m.body && (
          <p className="whitespace-pre-wrap text-body text-fg">{m.body}</p>
        )}
        {m.hasAttachment && (
          <GhostButton
            className="mt-1"
            disabled={opening}
            onClick={() => void openPhoto()}
          >
            {opening ? "Opening…" : "View photo"}
          </GhostButton>
        )}
      </div>
    </div>
  );
}

function ContextRail({
  detail,
  onChanged,
}: {
  detail: AgentTicketDetail;
  onChanged: () => Promise<void>;
}) {
  const { ticket, order, previousTickets } = detail;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rupees = Number.parseInt(amount, 10);
  const valid = Number.isInteger(rupees) && rupees >= 1;

  async function credit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    noteOwnAction();
    try {
      await api.supportGoodwill(
        ticket.id,
        rupees * 100,
        note.trim() || undefined,
      );
      await onChanged();
      setAmount("");
      setNote("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not credit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card tone="inset" className="p-3">
        <SectionLabel>Requester</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact
            label="Who"
            value={ticket.requesterType === "rider" ? "Partner" : "Customer"}
          />
          <Fact label="Name" value={ticket.requesterName ?? "—"} />
          <Fact label="Earlier tickets" value={String(previousTickets)} />
          <Fact
            label="Rating"
            value={ticket.csatRating ? `${ticket.csatRating} / 5` : "—"}
          />
        </dl>
      </Card>

      {order ? (
        <Card tone="inset" className="p-3">
          <SectionLabel>Delivery</SectionLabel>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Fact label="Code" value={order.code} />
            <Fact label="Status" value={order.status} />
            <Fact label="Vehicle" value={order.vehicleName} />
            <Fact
              label="Paid"
              value={`${formatMoney(order.total)} · ${order.paymentMethod}`}
            />
            <Fact label="Refunded" value={formatMoney(order.refunded)} />
            <Fact label="Partner" value={order.riderName ?? "—"} />
            <Fact label="Goods" value={order.goodsCategory ?? "—"} />
            <Fact
              label="Declared"
              value={
                order.parcelWeightKg === null
                  ? "Not declared"
                  : `up to ${order.parcelWeightKg} kg${
                      order.declaredValue
                        ? ` · ${formatMoney(order.declaredValue)}`
                        : ""
                    }`
              }
            />
          </dl>
          <p className="mt-2 text-micro text-fg-muted">
            {order.pickupAddress} → {order.dropAddress}
          </p>
          <Link
            href={`/orders/${order.id}`}
            className="mt-2 inline-block text-micro text-accent"
          >
            Open the delivery →
          </Link>
        </Card>
      ) : (
        <Card tone="inset" className="p-3">
          <SectionLabel>Delivery</SectionLabel>
          <p className="mt-2 text-micro text-fg-muted">Not about a delivery.</p>
        </Card>
      )}

      {ticket.requesterType === "user" && order && ticket.control.canManage && (
        <Card tone="inset" className="p-3">
          <SectionLabel>Goodwill credit</SectionLabel>
          <p className="mt-1 text-micro text-fg-muted">
            To the customer&apos;s wallet, recorded as a refund on this
            delivery. Credited so far: {formatMoney(ticket.goodwill)}. The
            limit per conversation is set by finance.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              inputMode="numeric"
              placeholder="₹"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              aria-label="Goodwill amount in rupees"
            />
            <Button loading={busy} disabled={!valid} onClick={() => void credit()}>
              Credit
            </Button>
          </div>
          <Input
            className="mt-2"
            placeholder="Reason (kept on the refund)"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Reason for the goodwill credit"
          />
          {error && <p className="mt-2 text-micro text-danger">{error}</p>}
        </Card>
      )}
    </div>
  );
}

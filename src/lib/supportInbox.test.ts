import { describe, expect, it } from "vitest";
import { can } from "./permissions";
import {
  INBOX_TABS,
  categoryLabel,
  type TicketControl,
  isSupportTopic,
  ownerText,
  slaText,
  systemText,
} from "./supportInbox";

describe("support inbox", () => {
  const due = Date.parse("2026-09-26T09:15:00Z");

  it("counts down to the reply-by promise, then counts how late it is", () => {
    const ticket = { replyBy: "2026-09-26T09:15:00Z" };
    expect(slaText(ticket, due - 10 * 60_000)).toBe("reply in 10 m");
    expect(slaText(ticket, due + 5 * 60_000)).toBe("5 m late");
    expect(slaText(ticket, due + 125 * 60_000)).toBe("2 h 5 m late");
  });

  it("says nothing once the promise is kept, or before the clock is known", () => {
    expect(slaText({ replyBy: null }, due)).toBeNull();
    // Zero is the server-render clock; drawing "-29000000 m late" there would
    // flash on every load.
    expect(slaText({ replyBy: "2026-09-26T09:15:00Z" }, 0)).toBeNull();
  });

  it("names every topic, and never hides an unknown one", () => {
    expect(categoryLabel("damaged_or_missing")).toBe("Damage / missing item");
    expect(categoryLabel("brand_new_topic")).toBe("brand new topic");
  });

  it("words system events and leaves unknown codes readable", () => {
    expect(systemText("escalated")).toMatch(/grievance/);
    expect(systemText("mystery")).toBe("mystery");
  });

  it("reacts to support topics only", () => {
    expect(isSupportTopic("support.ticket.created")).toBe(true);
    expect(isSupportTopic("order.placed")).toBe(false);
  });

  it("leads with open work and ends with history", () => {
    expect(INBOX_TABS[0]?.view).toBe("open");
    expect(INBOX_TABS[INBOX_TABS.length - 1]?.view).toBe("resolved");
  });

  it("is the support desk's — and never finance's", () => {
    expect(can("support", "support.tickets")).toBe(true);
    expect(can("ops", "support.tickets")).toBe(true);
    expect(can("owner", "support.tickets")).toBe(true);
    expect(can("finance", "support.tickets")).toBe(false);
    expect(can("dev_admin", "support.tickets")).toBe(false);
  });
});

describe("one conversation, one voice", () => {
  const control = (over: Partial<TicketControl>): TicketControl => ({
    owner: "none",
    ownerAway: false,
    canReply: true,
    canManage: true,
    canTakeOver: false,
    canReassign: false,
    ...over,
  });
  const ravi = { id: "r", name: "Ravi" };

  it("says whose conversation it is", () => {
    expect(ownerText({ assignedTo: null, control: control({}) })).toBe(
      "Unassigned — replying picks it up",
    );
    expect(
      ownerText({ assignedTo: ravi, control: control({ owner: "me" }) }),
    ).toBe("You are handling this");
    expect(
      ownerText({
        assignedTo: ravi,
        control: control({ owner: "other", canReply: false }),
      }),
    ).toBe("Ravi is handling this");
    expect(
      ownerText({
        assignedTo: ravi,
        control: control({ owner: "other", ownerAway: true, canTakeOver: true }),
      }),
    ).toBe("Ravi is handling this, but has not answered for a while");
  });

  it("refreshes every open screen when a colleague replies, takes or resolves", () => {
    expect(isSupportTopic("support.reply")).toBe(true);
    expect(isSupportTopic("support.assigned")).toBe(true);
    expect(isSupportTopic("support.updated")).toBe(true);
  });
});

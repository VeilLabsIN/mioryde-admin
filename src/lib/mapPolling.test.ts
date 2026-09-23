import { describe, expect, it } from "vitest";
import type { LiveMapSnapshot, MapRider } from "@/lib/api";
import {
  ACTIVE_MS,
  IDLE_MS,
  STANDBY_MS,
  pollIntervalFor,
  secondsSinceFix,
} from "./mapPolling";

function rider(status: MapRider["status"]): MapRider {
  return {
    id: `r-${status}`,
    name: "A partner",
    lat: 30.901,
    lng: 75.8573,
    heading: null,
    lastFixAt: "2026-09-23T12:00:00.000Z",
    status,
    activeOrderId: null,
    activeOrderCode: null,
  };
}

function snapshot(
  riders: MapRider[],
  orders: LiveMapSnapshot["orders"] = [],
): LiveMapSnapshot {
  return {
    now: "2026-09-23T12:00:30.000Z",
    staleAfterSeconds: 90,
    riders,
    orders,
  };
}

describe("how often the map asks", () => {
  it("asks fast while a vehicle is moving", () => {
    expect(pollIntervalFor(snapshot([rider("delivering")]))).toBe(ACTIVE_MS);
  });

  it("asks fast while any order is in flight, assigned or not", () => {
    // An unassigned pickup is exactly what a dispatcher is waiting to act on.
    const orders = [{ id: "o1" }] as unknown as LiveMapSnapshot["orders"];
    expect(pollIntervalFor(snapshot([], orders))).toBe(ACTIVE_MS);
  });

  it("eases off when somebody is on duty with nothing to do", () => {
    expect(pollIntervalFor(snapshot([rider("idle")]))).toBe(STANDBY_MS);
  });

  it("does not ease off for a rider who has gone dark", () => {
    // Silent while on duty is an incident, not a quiet night. Backing off to
    // thirty seconds is the wrong response to one unfolding.
    expect(pollIntervalFor(snapshot([rider("dark")]))).toBe(STANDBY_MS);
  });

  it("backs right off when the city is asleep", () => {
    expect(pollIntervalFor(snapshot([rider("offline")]))).toBe(IDLE_MS);
    expect(pollIntervalFor(snapshot([]))).toBe(IDLE_MS);
  });

  it("asks fast before the first snapshot arrives", () => {
    // Backing off on no information would make a busy evening take thirty
    // seconds to appear.
    expect(pollIntervalFor(null)).toBe(ACTIVE_MS);
  });

  it("takes the fastest rate any single rider justifies", () => {
    // One van moving among fifty signed-off partners still sets the pace.
    const mixed = snapshot([
      rider("offline"),
      rider("offline"),
      rider("delivering"),
    ]);
    expect(pollIntervalFor(mixed)).toBe(ACTIVE_MS);
  });

  it("is a real reduction, not a cosmetic one", () => {
    // The finding was ~7,200 requests per shift per tab. If these ever drift
    // back together the change has quietly undone itself.
    expect(IDLE_MS).toBeGreaterThanOrEqual(ACTIVE_MS * 5);
  });
});

describe("how old a position is", () => {
  const fix = "2026-09-23T12:00:00.000Z";
  const serverNow = "2026-09-23T12:00:30.000Z";

  it("uses the server's clock, not the dispatcher's", () => {
    // A machine ten minutes fast would otherwise paint the whole fleet dark —
    // or, far worse, show a genuinely dark rider as fresh.
    const received = 1_000_000;
    expect(secondsSinceFix(fix, serverNow, received, received)).toBe(30);
  });

  it("counts up while the browser holds the snapshot", () => {
    // Between polls the ages must keep moving, or a map that has stopped
    // updating looks exactly like a city where nothing is happening.
    const received = 1_000_000;
    expect(secondsSinceFix(fix, serverNow, received, received + 5000)).toBe(35);
  });

  it("never reports a negative age", () => {
    // Clock skew between the database and the API can put a fix marginally in
    // the future. "-2s ago" reads as a bug in the panel.
    const received = 1_000_000;
    expect(
      secondsSinceFix(serverNow, fix, received, received),
    ).toBeGreaterThanOrEqual(0);
  });

  it("returns zero rather than NaN for an unparseable date", () => {
    expect(secondsSinceFix("not a date", serverNow, 0, 0)).toBe(0);
    expect(secondsSinceFix(fix, "not a date", 0, 0)).toBe(0);
  });
});

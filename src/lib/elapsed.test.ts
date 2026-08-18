import { describe, expect, it } from "vitest";
import {
  boardOrder,
  clockSkewMs,
  elapsedMs,
  formatElapsed,
  needsAttention,
} from "./elapsed";

describe("clockSkewMs", () => {
  it("is zero when the clocks agree", () => {
    expect(clockSkewMs("2026-08-16T10:00:00.000Z", Date.parse("2026-08-16T10:00:00.000Z"))).toBe(0);
  });

  it("is positive when the workstation is ahead", () => {
    // The case this exists for: a machine four minutes fast would otherwise
    // age every delivery on the board by four minutes.
    const skew = clockSkewMs(
      "2026-08-16T10:00:00.000Z",
      Date.parse("2026-08-16T10:04:00.000Z"),
    );
    expect(skew).toBe(4 * 60_000);
  });

  it("is negative when the workstation is behind", () => {
    const skew = clockSkewMs(
      "2026-08-16T10:00:00.000Z",
      Date.parse("2026-08-16T09:58:00.000Z"),
    );
    expect(skew).toBe(-2 * 60_000);
  });

  it("falls back to trusting the local clock on an unparseable timestamp", () => {
    expect(clockSkewMs("not a date", 1_000)).toBe(0);
  });
});

describe("elapsedMs", () => {
  const since = "2026-08-16T10:00:00.000Z";

  it("measures against the server's clock, not the browser's", () => {
    // Workstation is four minutes fast and reports 10:26 local; the true
    // server time is 10:22, so the delivery is 22 minutes old, not 26.
    const clientNow = Date.parse("2026-08-16T10:26:00.000Z");
    expect(elapsedMs(since, clientNow, 4 * 60_000)).toBe(22 * 60_000);
  });

  it("keeps counting up between fetches", () => {
    const first = elapsedMs(since, Date.parse("2026-08-16T10:05:00.000Z"), 0);
    const later = elapsedMs(since, Date.parse("2026-08-16T10:06:00.000Z"), 0);
    expect(later - first).toBe(60_000);
  });

  it("never goes negative", () => {
    // Sub-second disagreement around a just-created order. "-3s" reads as a
    // broken panel; zero reads as new.
    expect(elapsedMs(since, Date.parse("2026-08-16T09:59:59.000Z"), 0)).toBe(0);
  });

  it("returns zero for an unparseable instant", () => {
    expect(elapsedMs("", Date.now(), 0)).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("shows seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45_000)).toBe("45s");
  });

  it("truncates rather than rounding", () => {
    // 4m50s must not read as 5m: a dispatcher acting on a five-minute
    // threshold should never be told something crossed it before it did.
    expect(formatElapsed(4 * 60_000 + 50_000)).toBe("4m");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("switches to hours and pads the minutes", () => {
    expect(formatElapsed(60 * 60_000)).toBe("1h 00m");
    expect(formatElapsed(64 * 60_000)).toBe("1h 04m");
    expect(formatElapsed(150 * 60_000)).toBe("2h 30m");
    expect(formatElapsed(23 * 3_600_000 + 59 * 60_000)).toBe("23h 59m");
  });

  it("switches to days past twenty-four hours", () => {
    // A delivery nobody closed out. `170h 23m` is a number an operator has to
    // do arithmetic on before they can react to it.
    expect(formatElapsed(24 * 3_600_000)).toBe("1d 00h");
    expect(formatElapsed(7 * 24 * 3_600_000 + 2 * 3_600_000)).toBe("7d 02h");
  });
});

describe("needsAttention", () => {
  it("flags a delivery nobody has accepted after five minutes", () => {
    expect(needsAttention("pending", 4 * 60_000)).toBe(false);
    expect(needsAttention("pending", 5 * 60_000)).toBe(true);
  });

  it("gives a partner in traffic longer than dispatch gets", () => {
    // The reason thresholds are per-status rather than one number.
    expect(needsAttention("assigned", 6 * 60_000)).toBe(false);
    expect(needsAttention("in_transit", 60 * 60_000)).toBe(false);
  });

  it("does not flag a status it has not been taught about", () => {
    // A new status shipping as a screen full of warnings would train
    // operators to ignore the flag.
    expect(needsAttention("scheduled", 10 * 60 * 60_000)).toBe(false);
  });
});

describe("boardOrder", () => {
  const NOW = Date.parse("2026-08-18T12:00:00.000Z");
  const agoMin = (m: number) => new Date(NOW - m * 60_000).toISOString();

  it("puts a flagged delivery above an older unflagged one", () => {
    // The case the board got wrong. A long haul collected two minutes ago is
    // not urgent; a delivery nobody has accepted for eight minutes is.
    const ordered = boardOrder(
      [
        { code: "LONGHAUL", status: "in_transit", statusSince: agoMin(90) },
        { code: "STUCK", status: "pending", statusSince: agoMin(8) },
      ],
      NOW,
      0,
    );
    expect(ordered.map((o) => o.code)).toEqual(["STUCK", "LONGHAUL"]);
  });

  it("ranks flagged deliveries among themselves by time in status", () => {
    const ordered = boardOrder(
      [
        { code: "NEWER", status: "pending", statusSince: agoMin(6) },
        { code: "OLDER", status: "pending", statusSince: agoMin(40) },
      ],
      NOW,
      0,
    );
    expect(ordered.map((o) => o.code)).toEqual(["OLDER", "NEWER"]);
  });

  it("corrects for a workstation clock that is running fast", () => {
    // Four minutes fast: without the correction this pending order reads as
    // six minutes old and crosses the five-minute threshold it has not
    // actually reached.
    const skew = 4 * 60_000;
    const orders = [{ code: "FRESH", status: "pending", statusSince: agoMin(2) }];
    expect(needsAttention("pending", elapsedMs(orders[0]!.statusSince, NOW, skew))).toBe(
      false,
    );
    expect(boardOrder(orders, NOW, skew)).toHaveLength(1);
  });

  it("does not mutate the array it was given", () => {
    // The board holds this array in state; sorting in place would reorder the
    // snapshot under React without a re-render.
    const input = [
      { code: "A", status: "pending", statusSince: agoMin(1) },
      { code: "B", status: "pending", statusSince: agoMin(30) },
    ];
    boardOrder(input, NOW, 0);
    expect(input.map((o) => o.code)).toEqual(["A", "B"]);
  });
});

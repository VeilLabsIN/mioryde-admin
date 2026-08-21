import { describe, expect, it } from "vitest";
import {
  minorToRupeeInput,
  percentToBasisPoints,
  rupeesToMinor,
} from "./rupees";

describe("rupeesToMinor", () => {
  it("reads whole rupees and decimals", () => {
    expect(rupeesToMinor("35")).toEqual({ ok: true, minor: 3500 });
    expect(rupeesToMinor("35.00")).toEqual({ ok: true, minor: 3500 });
    expect(rupeesToMinor("35.5")).toEqual({ ok: true, minor: 3550 });
    expect(rupeesToMinor("0.05")).toEqual({ ok: true, minor: 5 });
    expect(rupeesToMinor("0")).toEqual({ ok: true, minor: 0 });
  });

  it("does not go through a float", () => {
    // `Number("1.15") * 100` is 114.99999999999999 and `8.7 * 100` is
    // 869.9999999999999. Both are correct here because the digits are never
    // multiplied.
    expect(rupeesToMinor("1.15")).toEqual({ ok: true, minor: 115 });
    expect(rupeesToMinor("8.7")).toEqual({ ok: true, minor: 870 });
    expect(rupeesToMinor("1234567.89")).toEqual({ ok: true, minor: 123456789 });
  });

  it("accepts what the panel itself prints", () => {
    // A figure copied out of the rate table arrives with a symbol and Indian
    // grouping. Refusing it would be refusing our own output.
    expect(rupeesToMinor("₹1,25,000.50")).toEqual({ ok: true, minor: 12500050 });
    expect(rupeesToMinor(" 42 ")).toEqual({ ok: true, minor: 4200 });
  });

  it("explains a refusal instead of just refusing", () => {
    expect(rupeesToMinor("")).toEqual({ ok: false, error: "Enter an amount." });
    expect(rupeesToMinor("abc")).toEqual({ ok: false, error: "Numbers only." });
    // A negative fare is not a discount, it is a typo.
    expect(rupeesToMinor("-5").ok).toBe(false);
    expect(rupeesToMinor("1.234")).toEqual({
      ok: false,
      error: "Use at most 2 decimal places.",
    });
  });
});

describe("percentToBasisPoints", () => {
  it("scales a percentage the way the API takes it", () => {
    expect(percentToBasisPoints("18")).toEqual({ ok: true, minor: 1800 });
    expect(percentToBasisPoints("2.5")).toEqual({ ok: true, minor: 250 });
    expect(percentToBasisPoints("0")).toEqual({ ok: true, minor: 0 });
  });
});

describe("minorToRupeeInput", () => {
  it("round-trips through the parser", () => {
    for (const minor of [0, 5, 3500, 3550, 123456789]) {
      expect(rupeesToMinor(minorToRupeeInput(minor))).toEqual({
        ok: true,
        minor,
      });
    }
  });

  it("always shows two decimals", () => {
    expect(minorToRupeeInput(3500)).toBe("35.00");
    expect(minorToRupeeInput(5)).toBe("0.05");
  });
});

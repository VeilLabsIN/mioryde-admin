import { describe, expect, it } from "vitest";
import { describeParcel } from "./parcel";

describe("describeParcel", () => {
  it("says nothing for an order with no declaration", () => {
    // Orders from before 0056. "0 kg" would read as a claim the customer
    // never made.
    expect(describeParcel(null)).toBeNull();
  });

  it("reads the weight as a declaration, not a measurement", () => {
    expect(
      describeParcel({ weightKg: 100, count: 3, declaredValue: null, note: null }),
    ).toBe("up to 100 kg · 3 items");
  });

  it("uses the singular for one item", () => {
    expect(
      describeParcel({ weightKg: 5, count: 1, declaredValue: null, note: null }),
    ).toBe("up to 5 kg · 1 item");
  });

  it("includes the declared value when there is one", () => {
    expect(
      describeParcel({
        weightKg: 20,
        count: 1,
        declaredValue: { minor: 800000, currency: "INR" },
        note: null,
      }),
    ).toContain("worth");
  });
});

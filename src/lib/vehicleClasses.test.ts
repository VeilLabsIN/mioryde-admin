import { describe, expect, it } from "vitest";
import { activationBlocker } from "./vehicleClasses";

describe("activationBlocker", () => {
  it("refuses a class with no rate card anywhere", () => {
    // It would appear on the customer home screen and never be quoted.
    expect(activationBlocker({ maxWeightKg: 500 }, 0)).toMatch(/rate card/);
  });

  it("refuses a class with no weight limit", () => {
    expect(activationBlocker({ maxWeightKg: null }, 2)).toMatch(/maximum load/);
  });

  it("allows a priced class with a limit", () => {
    expect(activationBlocker({ maxWeightKg: 500 }, 1)).toBeNull();
  });
});

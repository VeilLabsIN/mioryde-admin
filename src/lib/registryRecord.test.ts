import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RecordCheck } from "./api";
import {
  expiryDisagreement,
  flagText,
  licenceFactLines,
  licenceValidUntil,
  scoreText,
  statusText,
  vehicleFactLines,
} from "./registryRecord";

function check(overrides: Partial<RecordCheck> = {}): RecordCheck {
  return {
    id: "c1",
    kind: "dl",
    vehicleId: null,
    provider: "cashfree",
    reference: "****1234",
    status: "found",
    nameScore: 92,
    facts: {
      name: "RAVI KUMAR",
      nonTransportUntil: "2031-04-12",
      transportUntil: null,
      classes: ["LMV", "MCWG"],
    },
    flags: [],
    requestedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("the licence card", () => {
  it("shows no dates before the reviewer has typed one", () => {
    // The expiry is re-keyed blind from the photograph. A date on the card
    // would turn the re-key into copying.
    const lines = licenceFactLines(check());
    expect(lines).toEqual(["Name on licence: RAVI KUMAR", "Classes: LMV, MCWG"]);
    expect(lines.join(" ")).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("points out a disagreement only after the reviewer typed a full date", () => {
    expect(expiryDisagreement("", check())).toBeNull();
    expect(expiryDisagreement("2031-04", check())).toBeNull();
    expect(expiryDisagreement("2031-04-12", check())).toBeNull();
    expect(expiryDisagreement("2030-01-01", check())).toBe("2031-04-12");
  });

  it("uses the later of the two validity dates", () => {
    expect(
      licenceValidUntil(
        check({
          facts: { nonTransportUntil: "2031-04-12", transportUntil: "2033-01-01" },
        }),
      ),
    ).toBe("2033-01-01");
    expect(licenceValidUntil(check({ status: "not_found", facts: {} }))).toBeNull();
    expect(licenceValidUntil(null)).toBeNull();
  });

  it("the card component never renders a validity date", () => {
    const src = readFileSync("src/components/RegistryRecord.tsx", "utf8");
    expect(src).not.toMatch(/nonTransportUntil|transportUntil|licenceValidUntil/);
  });
});

describe("wording", () => {
  it("says what the lookup found", () => {
    expect(statusText(null)).toBe("Not checked yet");
    expect(statusText(check())).toBe("Found on Parivahan");
    expect(statusText(check({ status: "not_found" }))).toBe("Not found on Parivahan");
    expect(statusText(check({ status: "error" }))).toMatch(/photograph/);
  });

  it("reads the name score against the threshold", () => {
    expect(scoreText(null, 80)).toBeNull();
    expect(scoreText(92, 80)).toBe("Name matches (92/100)");
    expect(scoreText(40, 80)).toBe("Name differs (40/100)");
  });

  it("words every flag, and falls back for unknown ones", () => {
    expect(flagText("rc_blacklisted")).toBe("RC blacklisted");
    expect(flagText("something_new")).toBe("something new");
  });

  it("summarises an RC", () => {
    const lines = vehicleFactLines(
      check({
        kind: "rc",
        facts: {
          makerModel: "TATA ACE",
          vehicleClass: "Goods Carrier",
          ownerName: "RAVI KUMAR",
          grossWeightKg: 1615,
          unladenWeightKg: 865,
          isCommercial: true,
          insuranceUntil: "2030-01-01",
          pucUntil: null,
        },
      }),
    );
    expect(lines).toEqual([
      "TATA ACE · Goods Carrier",
      "Registered owner: RAVI KUMAR",
      "Gross 1615 kg · unladen 865 kg · carries about 750 kg",
      "Commercial registration",
      "Insured until 2030-01-01",
    ]);
    expect(vehicleFactLines(check({ kind: "rc", status: "error", facts: {} }))).toEqual([]);
  });
});

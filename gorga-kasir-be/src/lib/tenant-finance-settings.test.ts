import { describe, expect, it } from "vitest";

import { isDateInClosedPeriod } from "./finance-period";

describe("isDateInClosedPeriod", () => {
  it("returns false when no period is closed", () => {
    expect(isDateInClosedPeriod(new Date().toISOString(), undefined)).toBe(false);
  });

  it("returns true when date is within closed period", () => {
    expect(isDateInClosedPeriod("2026-03-10T00:00:00.000Z", "2026-03-31T23:59:59.999Z")).toBe(true);
  });

  it("returns false when date is after closed period", () => {
    expect(isDateInClosedPeriod("2026-04-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { hasPermission } from "./roles";

describe("permission matrix", () => {
  it("allows owner to close finance period", () => {
    expect(hasPermission("owner", false, "finance.period.close")).toBe(true);
  });

  it("blocks manager from closing finance period", () => {
    expect(hasPermission("manager", false, "finance.period.close")).toBe(false);
  });

  it("allows cashier for sales create and blocks purchase create", () => {
    expect(hasPermission("cashier", false, "sales.create")).toBe(true);
    expect(hasPermission("cashier", false, "purchase.create")).toBe(false);
  });

  it("allows super admin for any action", () => {
    expect(hasPermission("cashier", true, "users.manage")).toBe(true);
  });
});

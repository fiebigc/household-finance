import { describe, expect, it } from "vitest";
import { computeBankTransactionDedupeKey } from "./bankCsvImport";

describe("computeBankTransactionDedupeKey", () => {
  it("is stable for identical logical rows", async () => {
    const params = {
      householdId: "demo-household-se-001",
      bankAccountId: "acc-christian",
      bookedDateIso: "2026-03-15",
      amountSek: -1200.5,
      specification: "Sample grocery",
    };
    const a = await computeBankTransactionDedupeKey(params);
    const b = await computeBankTransactionDedupeKey(params);
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("differs when booking date changes", async () => {
    const base = {
      householdId: "demo-household-se-001",
      bankAccountId: "acc-christian",
      amountSek: -1200.5,
      specification: "Sample grocery",
    };
    const d1 = await computeBankTransactionDedupeKey({
      ...base,
      bookedDateIso: "2026-03-15",
    });
    const d2 = await computeBankTransactionDedupeKey({
      ...base,
      bookedDateIso: "2026-04-15",
    });
    expect(d1).not.toBe(d2);
  });
});

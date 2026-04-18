import { describe, expect, it } from "vitest";
import { aggregateMonthlySeriesFromTransactions } from "./bankTransactionSeries";

describe("aggregateMonthlySeriesFromTransactions", () => {
  it("matches income / cost / net semantics", () => {
    const points = aggregateMonthlySeriesFromTransactions([
      { dateIso: "2026-03-10", amountSek: 1000, accountId: "acc-a" },
      { dateIso: "2026-03-12", amountSek: -300, accountId: "acc-a" },
    ]);
    expect(points).toHaveLength(1);
    const p = points[0]!;
    expect(p.month).toBe("2026-03");
    expect(p.totalIncomeSek).toBe(1000);
    expect(p.totalCostSek).toBe(300);
    expect(p.netCashflowSek).toBe(700);
    expect(p.byAccountNetSek["acc-a"]).toBe(700);
  });
});

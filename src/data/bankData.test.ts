import { describe, expect, it } from "vitest";
import {
  buildMonthlySeriesFromCsv,
  buildRecurringCostsFromCsv,
  defaultBankAccounts,
} from "./bankData";

describe("buildMonthlySeriesFromCsv", () => {
  it("parses monthly points from bundled CSV exports", () => {
    const points = buildMonthlySeriesFromCsv();
    expect(points.length).toBeGreaterThan(0);
    const first = points[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(typeof first.month).toBe("string");
    expect(typeof first.totalIncomeSek).toBe("number");
    expect(typeof first.totalCostSek).toBe("number");
    expect(typeof first.netCashflowSek).toBe("number");
  });

  it("includes account-level nets for configured accounts", () => {
    const points = buildMonthlySeriesFromCsv();
    const anyPointWithAccount = points.some((point) =>
      defaultBankAccounts.some((account) => account.id in point.byAccountNetSek),
    );
    expect(anyPointWithAccount).toBe(true);
  });
});

describe("buildRecurringCostsFromCsv", () => {
  it("finds multiple stable monthly outflows in bundled exports", () => {
    const rows = buildRecurringCostsFromCsv();
    expect(rows.length).toBeGreaterThan(3);
    const labels = rows.map((r) => r.label.toLowerCase());
    // Bundled exports are fictional samples (`src/data/sample-bank-csv/`); real bank CSVs live in gitignored `docs/bank/`.
    expect(labels.some((l) => l.includes("sample"))).toBe(true);
  });
});


import { describe, expect, it } from "vitest";
import { calculateSgi } from "./sgiCalculator";
import { SGI_CEILING_ANNUAL_SEK } from "./swedishConstants";

describe("calculateSgi", () => {
  it("averages history and caps at SGI ceiling", () => {
    const r = calculateSgi({
      annualIncomeHistorySek: [600_000, 600_000],
      currentEmploymentMode: "employed",
      workingPercentage: 100,
    });
    expect(r.annualSgiSek).toBe(SGI_CEILING_ANNUAL_SEK);
    expect(r.notes.some((n) => n.includes("capped"))).toBe(true);
  });

  it("returns 0 when no history", () => {
    const r = calculateSgi({
      annualIncomeHistorySek: [],
      currentEmploymentMode: "unemployed",
      workingPercentage: 0,
    });
    expect(r.annualSgiSek).toBe(0);
  });
});

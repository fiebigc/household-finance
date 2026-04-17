import type { EmploymentMode } from "../../config/householdConfig";
import { SGI_CEILING_ANNUAL_SEK } from "./swedishConstants";

export interface SgiCalculatorInput {
  annualIncomeHistorySek: number[];
  currentEmploymentMode: EmploymentMode;
  workingPercentage: number;
}

export interface SgiCalculatorResult {
  annualSgiSek: number;
  notes: string[];
}

function averageAnnualIncome(values: number[]): number {
  const filtered = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (filtered.length === 0) return 0;
  const sum = filtered.reduce((a, b) => a + b, 0);
  return sum / filtered.length;
}

/**
 * Calculates a planning SGI from income history (annual amounts, SEK).
 * Uses the average of provided years, capped at the SGI ceiling.
 * Employment mode affects notes only; full qualification rules belong in domain docs.
 */
export function calculateSgi(input: SgiCalculatorInput): SgiCalculatorResult {
  const notes: string[] = [];
  const raw = averageAnnualIncome(input.annualIncomeHistorySek);
  const annualSgiSek = Math.min(raw, SGI_CEILING_ANNUAL_SEK);

  if (raw > SGI_CEILING_ANNUAL_SEK) {
    notes.push(`Income average ${Math.round(raw)} SEK capped at SGI ceiling ${SGI_CEILING_ANNUAL_SEK} SEK.`);
  }

  if (input.annualIncomeHistorySek.length === 0) {
    notes.push("No income history provided; SGI is 0.");
  }

  if (
    input.currentEmploymentMode === "parental_leave" ||
    input.currentEmploymentMode === "unemployed"
  ) {
    notes.push(
      "Employment mode may use a preserved SGI from a qualifying period; this value is the income-based estimate only.",
    );
  }

  if (input.workingPercentage < 100 && input.workingPercentage > 0) {
    notes.push(
      `Working ${input.workingPercentage}% does not automatically reduce SGI; part-time rules are scenario-specific.`,
    );
  }

  return { annualSgiSek: Math.max(0, annualSgiSek), notes };
}

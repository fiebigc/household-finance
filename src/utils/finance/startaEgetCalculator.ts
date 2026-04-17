import { calculateAkassa } from "./akassaCalculator";

export interface StartaEgetCalculatorInput {
  isAkassaMember: boolean;
  akassaMembershipMonths: number;
  plannedStartDate: string;
  unemploymentStartDate?: string;
  /** Annual SGI used for benefit level (same basis as A-kassa income-related). */
  annualSgiSek?: number;
}

export interface StartaEgetCalculatorResult {
  isEligible: boolean;
  monthlyGrantSek: number;
  qualifyingPeriodMet: boolean;
  notes: string[];
}

const MIN_MEMBERSHIP_MONTHS = 12;

/**
 * Starta eget bidrag (planning): mirrors income-related A-kassa amount when eligible.
 * Real rules include timing vs unemployment; this uses membership + optional unemployment start as hints.
 */
export function calculateStartaEgetBidrag(
  input: StartaEgetCalculatorInput,
): StartaEgetCalculatorResult {
  const notes: string[] = [];
  const qualifyingPeriodMet = input.akassaMembershipMonths >= MIN_MEMBERSHIP_MONTHS;
  const isEligible = input.isAkassaMember && qualifyingPeriodMet;

  if (!input.isAkassaMember) {
    notes.push("A-kassa membership is typically required for starta eget support.");
  }
  if (!qualifyingPeriodMet) {
    notes.push(
      `Income-related level usually requires at least ${MIN_MEMBERSHIP_MONTHS} months of membership (planning default).`,
    );
  }

  const sgi = input.annualSgiSek ?? 0;
  const akassa = calculateAkassa({
    annualSgiSek: sgi,
    membershipMonths: input.akassaMembershipMonths,
  });

  if (input.unemploymentStartDate) {
    notes.push(
      "unemploymentStartDate is recorded for scenario timing; detailed waiting-day rules are not modeled here.",
    );
  }

  notes.push(`Planned start date: ${input.plannedStartDate}.`);

  return {
    isEligible,
    monthlyGrantSek: isEligible ? akassa.monthlyGrossSek : 0,
    qualifyingPeriodMet,
    notes,
  };
}

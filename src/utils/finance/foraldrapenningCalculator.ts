import {
  FORALDERPENNING_DAILY_CAP_SEK,
  FORALDERPENNING_GRUND_DAILY_SEK,
  FORALDERPENNING_SGI_DAILY_FACTOR,
  SGI_CEILING_ANNUAL_SEK,
} from "./swedishConstants";

export interface ForaldrapenningCalculatorInput {
  annualSgiSek: number;
  daysRequested: number;
  taxRatePct?: number;
}

export interface ForaldrapenningCalculatorResult {
  dailyRateSek: number;
  monthlyGrossSek: number;
  monthlyNetSek: number;
  capApplied: boolean;
}

/**
 * Föräldrapenning (sjukpenningnivå): daily from SGI, cap 1078 SEK/day.
 * Monthly gross = daily × daysRequested (paid days in the period).
 */
export function calculateForaldrapenning(
  input: ForaldrapenningCalculatorInput,
): ForaldrapenningCalculatorResult {
  const cappedSgi = Math.min(Math.max(0, input.annualSgiSek), SGI_CEILING_ANNUAL_SEK);

  let dailyUncapped: number;
  if (cappedSgi <= 0) {
    dailyUncapped = FORALDERPENNING_GRUND_DAILY_SEK;
  } else {
    dailyUncapped = (cappedSgi * FORALDERPENNING_SGI_DAILY_FACTOR) / 365;
  }

  const dailyRateSek = Math.min(dailyUncapped, FORALDERPENNING_DAILY_CAP_SEK);
  const capApplied = dailyUncapped > FORALDERPENNING_DAILY_CAP_SEK + 1e-9;

  const days = Math.max(0, input.daysRequested);
  const monthlyGrossSek = dailyRateSek * days;

  const tax = input.taxRatePct ?? 0;
  const monthlyNetSek =
    monthlyGrossSek * (1 - Math.min(100, Math.max(0, tax)) / 100);

  return {
    dailyRateSek,
    monthlyGrossSek,
    monthlyNetSek,
    capApplied,
  };
}

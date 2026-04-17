/**
 * Planning constants for Swedish benefits and SGI (approximation).
 * Not official Försäkringskassan / Skatteverket output.
 */

export const PRISBASBELOPP_2026_SEK = 59_200;

/** SGI ceiling: prisbasbelopp × 10 */
export const SGI_CEILING_ANNUAL_SEK = PRISBASBELOPP_2026_SEK * 10;

/** Föräldrapenning sjukpenningnivå factor (≈ 80% × 0.97) */
export const FORALDERPENNING_SGI_DAILY_FACTOR = 0.776;

/** Grundnivå per day when SGI is missing or zero (planning default). */
export const FORALDERPENNING_GRUND_DAILY_SEK = 250;

export const FORALDERPENNING_DAILY_CAP_SEK = 1078;

export const CALENDAR_DAYS_PER_MONTH = 30;

/** A-kassa: max income basis per month (SEK) before replacement. */
export const AKASSA_MAX_MONTHLY_BASIS_SEK = 34_000;

export const AKASSA_DAILY_CAP_SEK = 1200;

export const AKASSA_WORKING_DAYS_PER_MONTH = 22;

/** First bracket replacement rate (days 1–100 in simplified model). */
export const AKASSA_REPLACEMENT_RATE_DEFAULT = 0.8;

/** Ränteavdrag: 30% on interest up to this amount per year. */
export const RANTEAVDRAG_FIRST_TIER_ANNUAL_CAP_SEK = 100_000;

export const RANTEAVDRAG_FIRST_TIER_RATE = 0.3;

export const RANTEAVDRAG_SECOND_TIER_RATE = 0.21;

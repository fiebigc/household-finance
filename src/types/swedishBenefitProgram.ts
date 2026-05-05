/** Shape of src/data/benefit-programs/se-2026.json — reference parameters only (no logic in TS literals). */

export type SwedishBenefitProgramYear = {
  year: number;
  currency: string;
  base_amounts: {
    prisbasbelopp_pbb: number;
    forhojt_prisbasbelopp: number;
    inkomstbasbelopp_ibb: number;
  };
  benefits: {
    sjukpenning: {
      name: string;
      description: string;
      calculation_factor: number;
      sgi_adjustment_factor: number;
      income_ceiling_pbb_multiple: number;
      max_annual_sgi: number;
      max_daily_payout: number;
      qualifying_deduction_pct: number;
      logic: string;
    };
    foraldrapenning: {
      name: string;
      sgi_level: {
        days: number;
        calculation_factor: number;
        sgi_adjustment_factor: number;
        income_ceiling_pbb_multiple: number;
        max_annual_sgi: number;
        max_daily_payout: number;
      };
      grundniva: { description: string; daily_amount: number };
      lagstaniva: { days: number; daily_amount: number };
    };
    vab: {
      name: string;
      calculation_factor: number;
      sgi_adjustment_factor: number;
      income_ceiling_pbb_multiple: number;
      max_annual_sgi: number;
      logic: string;
    };
  };
  pension_contributions: {
    general_pension_ceiling_ibb_multiple: number;
    max_pensionable_income: number;
  };
};

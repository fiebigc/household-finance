# Swedish Tax & Benefit Data Used in the App

This document extracts the Sweden-specific tax/benefit constants, formulas, and assumptions currently implemented in the app.

Primary code sources:
- `src/lib/swedishBenefits2026.ts`
- `src/lib/swedenStockholmTax.ts`
- `src/components/ScenariosTab.tsx`
- `src/lib/detectIncomeSource.ts`

## Scope and intent

- The model is explicitly a planning approximation, not an official output from Försäkringskassan, A-kassa, or Skatteverket.
- Geography: Stockholm.
- Period assumptions: 2026 constants where specified.
- Currency: SEK.

## Core constants (2026)

From `src/lib/swedishBenefits2026.ts`:

- `PRISBASBELOPP = 59_200`
- `SGI_CEILING = PRISBASBELOPP * 10 = 592_000`
- `STOCKHOLM_TAX_RATE = 0.3055` (documented constant; not directly applied in net-tax function)

### Föräldrapenning constants

- `FP_FACTOR = 0.776` (commented as `80% × 0.97`)
- `FP_MAX_DAILY = 1_288`
- `FP_LAGSTA_DAILY = 180`
- `FP_GRUND_DAILY = 250`
- `CALENDAR_DAYS_PER_MONTH = 30`

### A-kassa constants

- `AKASSA_MAX_MONTHLY_BASIS = 34_000`
- `AKASSA_MAX_DAILY = 1_236`
- `WORKING_DAYS_PER_MONTH = 22`
- Default replacement rate in code: `0.80` (first bracket)

### Daycare (maxtaxa) constants

- Child 1: `1_688 SEK/month`
- Child 2: `1_125 SEK/month`
- Child 3: `563 SEK/month`
- Child 4+: `0`

## Implemented formulas

## 1) Employment gross (hours scaling)

From `monthlyEmploymentGross(fullTimeGross, hoursPerWeek)`:

- `fraction = clamp(hoursPerWeek, 0..40) / 40`
- `employmentGross = fullTimeGross * fraction`

## 2) Föräldrapenning (sjukpenningnivå)

From `parentalDailySjukpenningniva(sgiAnnual)`:

- `cappedSGI = min(sgiAnnual, SGI_CEILING)`
- if `cappedSGI <= 0`: daily = `FP_GRUND_DAILY` (250)
- else: `daily = min((cappedSGI * 0.776) / 365, FP_MAX_DAILY)`

Monthly parental leave from `monthlyParentalLeaveGross(sgiAnnual, percent, useLagsta)`:

- `daily = useLagsta ? 180 : parentalDailySjukpenningniva(sgiAnnual)`
- `monthlyParental = daily * 30 * (percent / 100)`

## 3) A-kassa monthly gross

From `monthlyAkassaGross(previousMonthlyGross, percent, replacementRate=0.80)`:

- `basis = min(previousMonthlyGross, 34_000)`
- `monthlyFull = min(basis * replacementRate, 1_236 * 22)`
- `monthlyAkassa = monthlyFull * (percent / 100)`

Commented brackets:
- Day 1-100: `0.80`
- Day 101-200: `0.70`
- Day 201+: `0.65`

(Only `0.80` is used by default unless caller passes another rate.)

## 4) Starta eget subsidy

From `monthlyStartaEgetGross(previousMonthlyGross, percent)`:

- Calls a-kassa formula with replacement `0.80`
- `monthlyStartaEget = monthlyAkassaGross(previousMonthlyGross, percent, 0.80)`

## 5) Daycare monthly cost

From `monthlyDaycareCost(numberOfChildren)`:

- Sum of `[1688, 1125, 563]` for first three children
- Additional children contribute `0`

## 6) Total modeled gross for scenario line

From `computeBenefitBreakdown(input)`:

- `totalGross = employmentGross + parentalLeaveGross + akassaGross + startaEgetGross`
- Returns `daycareCost` separately

## Tax-to-net model used by the app

From `src/lib/swedenStockholmTax.ts`:

The app converts monthly gross to monthly net using a piecewise linear "tabellskatt-inspired" interpolation over these knots:

- `(18_000 -> 14_200)`
- `(25_000 -> 19_600)`
- `(32_000 -> 24_600)`
- `(40_000 -> 29_100)`
- `(48_000 -> 33_800)`
- `(56_000 -> 37_900)`
- `(65_000 -> 42_200)`
- `(75_000 -> 46_800)`

Rules:
- Below first knot: proportional scaling from first knot ratio
- Between knots: linear interpolation
- Above last knot: extrapolation with damped marginal net (`lastSlope * 0.92`)

Notes in code explicitly state this is not an exact Skatteverket replication (church fee, exact deductions, full tax credits, pension details omitted).

## Scenario integration behavior

From `src/components/ScenariosTab.tsx`:

- For each person with settings (`sgiAnnual` or `fullTimeGross`), app computes benefit breakdown using slider overrides.
- `daycareCost` and `extraExpenseSek` are added to expenses.
- To avoid double-counting, recurring income streams with labels matching benefit regex are skipped for modeled persons:
  - `BENEFIT_RE = /\b(fkassa|a[\s-]?kassa|sk\d+)\b/i`
- Net income is computed per persona/group and summed using `stockholmTabellMonthlyNetFromMonthlyGrossCombined`.

## Auto-detection heuristics (for slider defaults)

From `src/lib/detectIncomeSource.ts`:

- Parental detection regex: `\bfkassa\b`
- A-kassa detection regex: `\ba[\s-]?kassa\b`
- Daycare expense detection regex: `\b(barnomsorg|dagis|f[öo]rskola|sth h[äa]sselby)\b`

Heuristic outcomes:
- If FKASSA found for persona: set `parentalLeavePercent`
- If A-kassa found: set `akassaPercent`
- If both found: split 50/50
- Always sets `workHoursPerWeek = 0` when either benefit type is inferred
- Daycare inferred as count of matching expense rows, capped at 5

## Practical implications

- Benefit values and net salary are best treated as scenario-planning estimates.
- The strongest policy assumptions are currently embedded as code constants (not dynamic external lookups).
- If legal rates change, update constants/formulas in:
  - `src/lib/swedishBenefits2026.ts`
  - `src/lib/swedenStockholmTax.ts`


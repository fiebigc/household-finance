/**
 * Simplified **Sweden / Stockholms stad** net-income estimate for **employment** income.
 *
 * This is **not** an official Skatteverket calculation. It models typical results using a
 * **tabellskatt-inspired piecewise curve** (interpolated knots) suitable for household planning.
 * Church fee, exact grundavdrag, full jobbskatteavdrag, and pension details are not replicated.
 *
 * For regulation context: amounts are in **SEK**, taxation follows **inkomstskatt** (kommunal + ev.
 * statlig över brytpunkt), employer **arbetsgivaravgift** is outside employee cash flow.
 */

/**
 * Combined monthly **gross** employment income for one person (or one attribution group) → estimated **net** / month.
 * Uses linear interpolation between knots; extrapolates with diminishing marginal net above the last knot.
 */
export function stockholmTabellMonthlyNetFromMonthlyGrossCombined(monthlyGrossCombined: number): number {
  if (!Number.isFinite(monthlyGrossCombined) || monthlyGrossCombined <= 0) return 0;

  const knots: [number, number][] = [
    [18_000, 14_200],
    [25_000, 19_600],
    [32_000, 24_600],
    [40_000, 29_100],
    [48_000, 33_800],
    [56_000, 37_900],
    [65_000, 42_200],
    [75_000, 46_800],
  ];

  if (monthlyGrossCombined <= knots[0][0]) {
    const [g0, n0] = knots[0];
    return (n0 / g0) * monthlyGrossCombined;
  }

  for (let i = 0; i < knots.length - 1; i++) {
    const [g1, n1] = knots[i];
    const [g2, n2] = knots[i + 1];
    if (monthlyGrossCombined <= g2) {
      const t = (monthlyGrossCombined - g1) / (g2 - g1);
      return n1 + t * (n2 - n1);
    }
  }

  const [gLast1, nLast1] = knots[knots.length - 2];
  const [gLast2, nLast2] = knots[knots.length - 1];
  const marginal = (nLast2 - nLast1) / (gLast2 - gLast1);
  const damped = marginal * 0.92;
  return nLast2 + (monthlyGrossCombined - gLast2) * damped;
}

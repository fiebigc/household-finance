/**
 * Infers current work-param sliders from detected recurring income streams.
 * E.g., if FKASSA is the main income → person is on parental leave.
 */
import type { IncomeStream, PersonaWorkParams } from "@/lib/cashflow";

const PARENTAL_RE = /\bfkassa\b/i;
const AKASSA_RE = /\ba[\s-]?kassa\b/i;
const DAYCARE_RE = /\b(barnomsorg|dagis|f[öo]rskola|sth h[äa]sselby)\b/i;

export function inferWorkParamsFromStreams(
  incomeStreams: IncomeStream[],
  personaId: string,
): Partial<PersonaWorkParams> | null {
  const myStreams = incomeStreams.filter((s) => s.personaId === personaId);
  if (myStreams.length === 0) return null;

  let hasParental = false;
  let hasAkassa = false;

  for (const s of myStreams) {
    if (PARENTAL_RE.test(s.label)) hasParental = true;
    if (AKASSA_RE.test(s.label) && !PARENTAL_RE.test(s.label)) hasAkassa = true;
  }

  if (!hasParental && !hasAkassa) return null;

  const patch: Partial<PersonaWorkParams> = {
    workHoursPerWeek: 0,
  };

  if (hasParental && hasAkassa) {
    patch.parentalLeavePercent = 50;
    patch.akassaPercent = 50;
  } else if (hasParental) {
    patch.parentalLeavePercent = 100;
    patch.akassaPercent = 0;
  } else {
    patch.parentalLeavePercent = 0;
    patch.akassaPercent = 100;
  }

  return patch;
}

export function inferDaycareFromExpenses(
  expenses: Array<{ title: string; personaId: string | null }>,
): number {
  let count = 0;
  for (const e of expenses) {
    if (DAYCARE_RE.test(e.title)) count++;
  }
  return Math.min(count, 5);
}

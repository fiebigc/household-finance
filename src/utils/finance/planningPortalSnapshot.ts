/**
 * Swedish portal snapshot (Försäkringskassan, minpension, Pensionsmyndigheten) for planning UI.
 * Persisted in Supabase `app_household_planning.portal_snapshot`.
 *
 * Pension block: use `pensionColumns` (array) in JSON — one object per household member / portal login.
 * Each column may set `ownerAccountRef` to your own stable id (e.g. `auth.users.id`); `displayLabel` is shown in the UI.
 * Legacy single-column JSON with root `pensionFrom65` + `premiepension` is still parsed and normalized to one column.
 */

export type FkChildDaysSnapshot = {
  childLabel: string;
  totalRemaining: number;
  totalCap: number;
  duRemaining: number;
  partnerRemaining: number;
  sjukpenningnivaDu: number;
  lagstaDu: number;
  sjukpenningnivaPartner: number;
  lagstaPartner: number;
  dubbeldagarMax?: number;
};

export type PensionBracketRow = { label: string; sekPerMonth: number };

export type PensionFrom65Block = {
  title: string;
  salaryTodaySek: number;
  brackets: PensionBracketRow[];
};

export type PremiepensionBlock = {
  title: string;
  blurb: string;
  totalValueSek: number;
  valueChangeYtdPct: number;
  avgAnnualSinceStartPct: number;
  portfolioFeePct: number;
  avgCustomerFeePct: number;
};

export type PersonPensionPortalSlice = {
  /**
   * Optional key from your data model (e.g. Supabase auth user id). Stored only in DB JSON — do not hardcode in the app bundle.
   */
  ownerAccountRef: string | null;
  /** Column heading from JSON (e.g. profile display name). */
  displayLabel: string;
  pensionFrom65: PensionFrom65Block;
  premiepension: PremiepensionBlock;
};

export type PlanningPortalReference = {
  sourceNote: string;
  unto: FkChildDaysSnapshot;
  aaro: FkChildDaysSnapshot;
  pensionColumns: PersonPensionPortalSlice[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function num(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function str(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function parseFkChild(raw: unknown): FkChildDaysSnapshot | null {
  if (!isRecord(raw)) return null;
  const childLabel = str(raw.childLabel);
  const totalRemaining = num(raw.totalRemaining);
  const totalCap = num(raw.totalCap);
  const duRemaining = num(raw.duRemaining);
  const partnerRemaining = num(raw.partnerRemaining);
  const sjukpenningnivaDu = num(raw.sjukpenningnivaDu);
  const lagstaDu = num(raw.lagstaDu);
  const sjukpenningnivaPartner = num(raw.sjukpenningnivaPartner);
  const lagstaPartner = num(raw.lagstaPartner);
  if (
    childLabel == null ||
    totalRemaining == null ||
    totalCap == null ||
    duRemaining == null ||
    partnerRemaining == null ||
    sjukpenningnivaDu == null ||
    lagstaDu == null ||
    sjukpenningnivaPartner == null ||
    lagstaPartner == null
  ) {
    return null;
  }
  const dub = raw.dubbeldagarMax;
  const dubN = dub === undefined ? undefined : num(dub);
  return {
    childLabel,
    totalRemaining,
    totalCap,
    duRemaining,
    partnerRemaining,
    sjukpenningnivaDu,
    lagstaDu,
    sjukpenningnivaPartner,
    lagstaPartner,
    dubbeldagarMax: dubN === null ? undefined : dubN,
  };
}

function parseBrackets(raw: unknown): PensionBracketRow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PensionBracketRow[] = [];
  for (const row of raw) {
    if (!isRecord(row)) return null;
    const label = str(row.label);
    const sekPerMonth = num(row.sekPerMonth);
    if (label == null || sekPerMonth == null) return null;
    out.push({ label, sekPerMonth });
  }
  return out.length ? out : null;
}

function parsePensionFrom65Block(p65: Record<string, unknown>): PensionFrom65Block | null {
  const pTitle = str(p65.title);
  const salaryTodaySek = num(p65.salaryTodaySek);
  const brackets = parseBrackets(p65.brackets);
  if (pTitle == null || salaryTodaySek == null || brackets == null) return null;
  return { title: pTitle, salaryTodaySek, brackets };
}

function parsePremiepensionBlock(prem: Record<string, unknown>): PremiepensionBlock | null {
  const premTitle = str(prem.title);
  const blurb = str(prem.blurb);
  const totalValueSek = num(prem.totalValueSek);
  const valueChangeYtdPct = num(prem.valueChangeYtdPct);
  const avgAnnualSinceStartPct = num(prem.avgAnnualSinceStartPct);
  const portfolioFeePct = num(prem.portfolioFeePct);
  const avgCustomerFeePct = num(prem.avgCustomerFeePct);
  if (
    premTitle == null ||
    blurb == null ||
    totalValueSek == null ||
    valueChangeYtdPct == null ||
    avgAnnualSinceStartPct == null ||
    portfolioFeePct == null ||
    avgCustomerFeePct == null
  ) {
    return null;
  }
  return {
    title: premTitle,
    blurb,
    totalValueSek,
    valueChangeYtdPct,
    avgAnnualSinceStartPct,
    portfolioFeePct,
    avgCustomerFeePct,
  };
}

function parsePersonPensionColumn(raw: unknown): PersonPensionPortalSlice | null {
  if (!isRecord(raw)) return null;
  const displayLabel = str(raw.displayLabel) ?? str(raw.display_label);
  const ownerRaw = raw.ownerAccountRef ?? raw.owner_account_ref;
  const ownerAccountRef = ownerRaw === undefined || ownerRaw === null ? null : str(ownerRaw);
  const p65 = isRecord(raw.pensionFrom65) ? raw.pensionFrom65 : null;
  const prem = isRecord(raw.premiepension) ? raw.premiepension : null;
  if (displayLabel == null || !p65 || !prem) return null;
  const pensionFrom65 = parsePensionFrom65Block(p65);
  const premiepension = parsePremiepensionBlock(prem);
  if (!pensionFrom65 || !premiepension) return null;
  return { ownerAccountRef, displayLabel, pensionFrom65, premiepension };
}

function parsePensionColumnsArray(raw: unknown): PersonPensionPortalSlice[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cols: PersonPensionPortalSlice[] = [];
  for (const row of raw) {
    const col = parsePersonPensionColumn(row);
    if (!col) return null;
    cols.push(col);
  }
  return cols;
}

/** Returns null if JSON is empty or missing required fields (use DB seed / SQL to populate). */
export function parsePlanningPortalSnapshot(raw: unknown): PlanningPortalReference | null {
  if (!isRecord(raw)) return null;
  const sourceNote = str(raw.sourceNote);
  const unto = parseFkChild(raw.unto);
  const aaro = parseFkChild(raw.aaro);
  if (sourceNote == null || unto == null || aaro == null) return null;

  const fromColumns = parsePensionColumnsArray(raw.pensionColumns);
  if (fromColumns) {
    return { sourceNote, unto, aaro, pensionColumns: fromColumns };
  }

  const p65 = isRecord(raw.pensionFrom65) ? raw.pensionFrom65 : null;
  const prem = isRecord(raw.premiepension) ? raw.premiepension : null;
  if (!p65 || !prem) return null;
  const pensionFrom65 = parsePensionFrom65Block(p65);
  const premiepension = parsePremiepensionBlock(prem);
  if (!pensionFrom65 || !premiepension) return null;

  const displayLabel = str(raw.pensionDisplayLabel) ?? str(raw.pension_display_label) ?? "Pension";
  const ownerRaw = raw.pensionOwnerAccountRef ?? raw.pension_owner_account_ref;
  const ownerAccountRef = ownerRaw === undefined || ownerRaw === null ? null : str(ownerRaw);

  return {
    sourceNote,
    unto,
    aaro,
    pensionColumns: [{ ownerAccountRef, displayLabel, pensionFrom65, premiepension }],
  };
}

/** Update one pension column heading / entity link; persisted via `portal_snapshot` on next planning save. */
export function patchPensionColumnMeta(
  snapshot: PlanningPortalReference,
  columnIndex: number,
  patch: { displayLabel?: string; ownerAccountRef?: string | null },
): PlanningPortalReference {
  if (columnIndex < 0 || columnIndex >= snapshot.pensionColumns.length) return snapshot;
  const pensionColumns = snapshot.pensionColumns.map((col, i) =>
    i === columnIndex ? { ...col, ...patch } : col,
  );
  return { ...snapshot, pensionColumns };
}

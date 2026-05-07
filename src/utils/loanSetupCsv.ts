import Papa from "papaparse";
import type { AmortizationType, LoanType, RateType } from "@/types/schema";
import { parseSwedishAmount } from "@/utils/danskeLedgerCsv";

function normalizeHeaderKey(key: string): string {
  return key.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_");
}

/** Fold å/ä/ö so `datum_för_v…` matches `datum_for_v…`. */
function foldSvUnderscore(key: string): string {
  return normalizeHeaderKey(key).replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
}

/** Parsed numeric Swedish amount like `1.016.500,00` or `3,590 %`, or plain `3.59`. */
export function parseLoanCsvNumber(raw: string): number | null {
  const t = raw.replace(/^\uFEFF/, "").trim().replace(/\s+/g, "");
  if (!t) return null;
  const noPct = t.replace(/%$/i, "").trim();
  const unsigned = noPct.replace(/^-/, "");
  const hasComma = unsigned.includes(",");
  if (!hasComma && /\.[^.]+$/.test(unsigned)) {
    const intl = Number(noPct.replace(/^-/, ""));
    if (Number.isFinite(intl)) return Math.abs(intl);
  }
  const sw = parseSwedishAmount(noPct);
  if (Number.isFinite(sw)) return Math.abs(sw);
  const stripped = unsigned.replace(/\./g, "").replace(",", ".");
  const fallback = Number(stripped);
  return Number.isFinite(fallback) ? Math.abs(fallback) : null;
}

function parseIsoLikeDate(raw: string): string | null {
  const s = raw.replace(/^\uFEFF/, "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const ymdDot = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (ymdDot) {
    const y = Number(ymdDot[1]);
    const m = Number(ymdDot[2]);
    const d = Number(ymdDot[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function pick(row: Record<string, string>, aliases: string[]): string {
  const map = new Map(
    Object.entries(row).map(([k, v]) => [foldSvUnderscore(k), String(v ?? "").trim()] as const),
  );
  for (const a of aliases) {
    const hit = map.get(foldSvUnderscore(a));
    if (hit) return hit;
  }
  return "";
}

function parseLoanType(raw: string): LoanType {
  const n = normalizeHeaderKey(raw).replace(/-/g, "_");
  const ok: LoanType[] = ["mortgage", "car", "student", "personal", "other"];
  if (ok.includes(n as LoanType)) return n as LoanType;
  if (n.includes("bol") || n.includes("mort") || n.includes("hypotek")) return "mortgage";
  return "mortgage";
}

function parseRateType(raw: string): RateType {
  const n = normalizeHeaderKey(raw);
  if (n === "floating" || n === "float" || n === "rörlig" || n === "rorlig") return "floating";
  return "fixed";
}

function parseAmortType(raw: string, monthlyAmortHint: number | null): AmortizationType {
  const n = normalizeHeaderKey(raw).replace(/-/g, "_");
  const ok: AmortizationType[] = ["annuity", "straight_line", "interest_only", "custom"];
  if (ok.includes(n as AmortizationType)) return n as AmortizationType;
  if (monthlyAmortHint === 0 || monthlyAmortHint === null) return "interest_only";
  return "annuity";
}

function splitCoOwners(raw: string): string[] {
  return raw
    .split(/[|,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract holder name from Danske-style `YYYYMMDD-XXXX - Given Family`. */
export function parseKontohavareHint(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const dash = s.match(/\s-\s(.+)$/);
  return dash ? dash[1].trim() : s;
}

export type ParsedLoanSetupRow = {
  name: string;
  loanType: LoanType;
  principal: number;
  outstanding: number;
  interestPct: number;
  rateType: RateType;
  rateFixedUntil: string | null;
  rateIndex: string | null;
  rateMarginPct: number | null;
  amortType: AmortizationType;
  monthlyPayment: number | null;
  startDate: string;
  endDate: string | null;
  accountName: string | null;
  iban: string | null;
  bankName: string | null;
  existingAccountId: string | null;
  shared: boolean;
  coOwnerNames: string[];
  ownerEntityName: string | null;
};

export type ParseLoanSetupCsvResult = {
  rows: ParsedLoanSetupRow[];
  warnings: string[];
};

function isLedgerExportHeader(keys: string[]): boolean {
  const n = keys.map((k) => foldSvUnderscore(k));
  return n.includes("bokforingsdag") || n.some((x) => x.includes("bokforingsdag"));
}

export function parseLoanSetupCsv(csvText: string): ParseLoanSetupCsvResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0]?.message ?? "Could not parse CSV");
  }

  const rawRows = parsed.data.filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
  if (rawRows.length === 0) return { rows: [], warnings: [] };

  const sampleKeys = Object.keys(rawRows[0] ?? {});
  if (isLedgerExportHeader(sampleKeys)) {
    throw new Error(
      "This file looks like a bank transaction export (ledger), not a loan setup sheet. Use a CSV with columns such as name, principal, outstanding, and interest_rate_pct — or add a loan manually.",
    );
  }

  const warnings: string[] = [];
  const rows: ParsedLoanSetupRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const lineNo = i + 2;

    const name =
      pick(row, ["name", "loan_name", "title", "konto", "account_label"]) ||
      pick(row, ["lånenamn", "lanenamn"]);
    if (!name) {
      warnings.push(`Row ${lineNo}: skipped (no name / konto)`);
      continue;
    }

    const principalRaw = pick(row, ["principal", "maximalt", "credit_limit", "lånebelopp", "lanebelopp"]);
    const outstandingRaw = pick(row, [
      "outstanding",
      "balance",
      "saldo",
      "skuld",
      "nuvarande_skuld",
      "remaining",
    ]);

    const principal = principalRaw ? parseLoanCsvNumber(principalRaw) : null;
    let outstanding = outstandingRaw ? parseLoanCsvNumber(outstandingRaw) : null;

    if (principal == null || !Number.isFinite(principal) || principal <= 0) {
      warnings.push(`Row ${lineNo} (${name}): invalid principal — skipped`);
      continue;
    }
    if (outstanding == null || !Number.isFinite(outstanding) || outstanding <= 0) {
      outstanding = principal;
    }

    const interestRaw = pick(row, [
      "interest_rate_pct",
      "nominal_pct",
      "nominal_rate_pct",
      "skuldräntesats",
      "skuldrantesats",
      "interest_pct",
      "rate_pct",
    ]);
    const interestPct = interestRaw != null ? parseLoanCsvNumber(interestRaw) : null;
    if (interestPct == null || !Number.isFinite(interestPct)) {
      warnings.push(`Row ${lineNo} (${name}): invalid interest_rate_pct — skipped`);
      continue;
    }

    const rateType = parseRateType(pick(row, ["rate_type", "rate_kind", "räntetyp", "rantetyp"]) || "fixed");

    let rateFixedUntil: string | null = null;
    let rateIndex: string | null = null;
    let rateMarginPct: number | null = null;

    const fixedUntilRaw = pick(row, [
      "rate_fixed_until",
      "fixed_until",
      "bindning_slut",
      "datum_för_villkorsändring",
      "datum_for_villkorsandring",
      "villkorsändring",
      "villkorsandring",
    ]);
    if (fixedUntilRaw) rateFixedUntil = parseIsoLikeDate(fixedUntilRaw);

    const idxRaw = pick(row, ["rate_index", "index", "referensränta"]);
    const marginRaw = pick(row, ["rate_margin_pct", "marginal", "påslag"]);
    if (idxRaw.trim()) rateIndex = idxRaw.trim();
    if (marginRaw.trim()) {
      const m = parseLoanCsvNumber(marginRaw);
      if (m != null && Number.isFinite(m)) rateMarginPct = m;
    }

    const amortRaw = pick(row, ["amortization_type", "amortization", "amorteringstyp"]);
    const amortAmtRaw = pick(row, ["monthly_amortization", "amortering_per_månad", "amortering"]);
    const monthlyAmortHint = amortAmtRaw.trim() ? parseLoanCsvNumber(amortAmtRaw) : null;
    const amortType = parseAmortType(amortRaw, monthlyAmortHint);

    const monthlyPayRaw = pick(row, ["monthly_payment", "monthly_pay", "payment", "summa_att_betala"]);
    let monthlyPayment: number | null = null;
    if (monthlyPayRaw.trim()) {
      const mp = parseLoanCsvNumber(monthlyPayRaw);
      if (mp != null && Number.isFinite(mp)) monthlyPayment = mp;
    }

    const startRaw = pick(row, ["start_date", "datum_för_upprättande", "datum_for_upprattande", "upprättande"]);
    const startDate = parseIsoLikeDate(startRaw) ?? new Date().toISOString().slice(0, 10);

    const endRaw = pick(row, [
      "end_date",
      "maturity",
      "slutbetalningsdag",
      "lånets_slutbetalningsdag",
      "lanets_slutbetalningsdag",
    ]);
    const endDate = endRaw.trim() ? parseIsoLikeDate(endRaw) : null;

    const accountNameRaw = pick(row, ["account_name", "account_label", "loan_account"]);
    const ibanRaw = pick(row, ["iban"]);
    const bankNameRaw = pick(row, ["bank_name", "bic", "swift"]);

    const existingAccountIdRaw = pick(row, ["existing_account_id", "account_id"]).trim();

    const sharedRaw = pick(row, ["shared", "joint", "gemensam"]).toLowerCase();
    const shared =
      sharedRaw === "true" ||
      sharedRaw === "1" ||
      sharedRaw === "yes" ||
      sharedRaw === "ja";

    let coOwnerNames = splitCoOwners(pick(row, ["co_owners", "co_owner_names", "delägare"]));

    let ownerEntityName =
      pick(row, ["owner_entity_name", "entity", "owner"]).trim() || null;
    const kontohavareRaw = pick(row, ["kontohavare", "holder"]);
    if (!ownerEntityName && kontohavareRaw) ownerEntityName = parseKontohavareHint(kontohavareRaw);

    rows.push({
      name,
      loanType: parseLoanType(pick(row, ["loan_type", "type", "kontotyp"]) || "mortgage"),
      principal,
      outstanding,
      interestPct,
      rateType,
      rateFixedUntil: rateType === "fixed" ? rateFixedUntil : null,
      rateIndex: rateType === "floating" ? rateIndex : null,
      rateMarginPct: rateType === "floating" ? rateMarginPct : null,
      amortType,
      monthlyPayment,
      startDate,
      endDate,
      accountName: accountNameRaw.trim() || null,
      iban: ibanRaw.trim() || null,
      bankName: bankNameRaw.trim() || null,
      existingAccountId: existingAccountIdRaw || null,
      shared,
      coOwnerNames,
      ownerEntityName,
    });
  }

  return { rows, warnings };
}

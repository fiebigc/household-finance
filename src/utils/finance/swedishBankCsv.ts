/**
 * Swedish bank export CSV (semicolon-separated, Swedish number format).
 * Used by bundled samples, Supabase import, and recurring heuristics.
 */

export interface ParsedBankRow {
  dateIso: string;
  specification: string;
  amountSek: number;
  accountId: string;
}

export interface CsvTransaction {
  dateIso: string;
  amountSek: number;
  accountId: string;
}

export function parseSek(value: string): number {
  const normalized = value
    .replace(/"/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized || "0");
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/"/g, "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "")
    .toLowerCase();
}

/** Stable key for the counterparty / memo text (dedupe + recurring grouping). */
export function canonicalTransactionSourceKey(raw: string): string {
  const t = raw
    .replace(/"/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return "";
  if (t.includes("cursor")) return "merchant:cursor_ai";
  if (t.includes("amazon prime")) return "merchant:amazon_prime";
  if (t.includes("unionen")) return "merchant:unionen";
  if (t.includes("ownit")) return "merchant:ownit";
  if (t.includes("folksam")) return "merchant:folksam";
  if (t.includes("fkassa") || t.includes("f-kassa")) return "income:fkassa";
  if (t.includes("barnbdr") || t.includes("barnbidrag")) return "income:barnbidrag";
  if (t.startsWith("ofu ")) return "income:ofu_salary";
  return `text:${t.slice(0, 72)}`;
}

export function parseCsvTransactions(csvRaw: string, accountId: string): CsvTransaction[] {
  const lines = csvRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headerParts = headerLine.split(";").map((p) => normalizeHeader(p));
  const dateIdx = headerParts.findIndex(
    (h) => h.includes("bokforings") || (h.includes("bokf") && h.includes("dag")),
  );
  const amountIdx = headerParts.findIndex((h) => h.includes("belopp"));
  const statusIdx = headerParts.findIndex((h) => h.includes("status"));
  const rows = lines.slice(1);

  if (dateIdx < 0 || amountIdx < 0) {
    return [];
  }

  const result: CsvTransaction[] = [];
  for (const row of rows) {
    const parts = row.split(";").map((p) => p.trim());
    const date = parts[dateIdx]?.replace(/"/g, "");
    const amountRaw = parts[amountIdx];
    const status =
      statusIdx >= 0 ? parts[statusIdx]?.replace(/"/g, "").trim() : undefined;
    if (!date || !amountRaw) continue;
    const normalizedStatus = (status ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      normalizedStatus.includes("avvisad") ||
      normalizedStatus.includes("failed") ||
      normalizedStatus.includes("declined")
    ) {
      continue;
    }
    result.push({
      dateIso: date,
      amountSek: parseSek(amountRaw),
      accountId,
    });
  }
  return result;
}

export function parseCsvRowsDetailed(csvRaw: string, accountId: string): ParsedBankRow[] {
  const lines = csvRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headerParts = headerLine.split(";").map((p) => normalizeHeader(p));
  const dateIdx = headerParts.findIndex(
    (h) => h.includes("bokforings") || (h.includes("bokf") && h.includes("dag")),
  );
  const amountIdx = headerParts.findIndex((h) => h.includes("belopp"));
  const specIdx = headerParts.findIndex((h) => h.includes("specifik"));
  const statusIdx = headerParts.findIndex((h) => h.includes("status"));
  const rows = lines.slice(1);

  if (dateIdx < 0 || amountIdx < 0 || specIdx < 0) {
    return [];
  }

  const result: ParsedBankRow[] = [];
  for (const row of rows) {
    const parts = row.split(";").map((p) => p.trim());
    const date = parts[dateIdx]?.replace(/"/g, "");
    const amountRaw = parts[amountIdx];
    const spec = parts[specIdx]?.replace(/"/g, "") ?? "";
    const status =
      statusIdx >= 0 ? parts[statusIdx]?.replace(/"/g, "").trim() : undefined;
    if (!date || !amountRaw) continue;
    const normalizedStatus = (status ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      normalizedStatus.includes("avvisad") ||
      normalizedStatus.includes("failed") ||
      normalizedStatus.includes("declined")
    ) {
      continue;
    }
    result.push({
      dateIso: date,
      specification: spec,
      amountSek: parseSek(amountRaw),
      accountId,
    });
  }
  return result;
}

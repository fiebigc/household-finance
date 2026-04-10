/** Shared parsing for Danske Bank CSV exports (semicolon, Swedish number format). */

export type DanskeTransactionRow = {
  dateStr: string;
  specifikation: string;
  belopp: number;
  saldo: number | null;
  status: string;
  lineIndex: number;
};

export function parseSwedishNumber(cell: string): number | null {
  const t = cell.trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line: string): string[] {
  return line.split(";").map((p) => p.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

/** Completed booking (handles encoding glitches on "Utförd"). */
export function isBookingCompleted(status: string): boolean {
  return /utf.rd/i.test(status);
}

export function parseDanskeTransactionCsv(text: string): DanskeTransactionRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const dateIdx = header.findIndex((h) => /bokf.ringsdag/i.test(h));
  const specIdx = header.findIndex((h) => /specifikation/i.test(h));
  const beloppIdx = header.findIndex((h) => /belopp/i.test(h));
  const saldoIdx = header.findIndex((h) => /saldo/i.test(h));
  const statusIdx = header.findIndex((h) => /status/i.test(h));
  if (dateIdx < 0 || specIdx < 0 || beloppIdx < 0 || statusIdx < 0) return [];

  const out: DanskeTransactionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const dateStr = cells[dateIdx]?.trim() ?? "";
    const spec = cells[specIdx]?.trim() ?? "";
    const status = cells[statusIdx]?.trim() ?? "";
    const beloppRaw = cells[beloppIdx] ?? "";
    const belopp = parseSwedishNumber(beloppRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || belopp === null) continue;
    if (!isBookingCompleted(status)) continue;
    const saldo = saldoIdx >= 0 ? parseSwedishNumber(cells[saldoIdx] ?? "") : null;
    out.push({ dateStr, specifikation: spec, belopp, saldo, status, lineIndex: i });
  }
  return out;
}

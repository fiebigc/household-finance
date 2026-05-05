/**
 * Parse Danske-style semicolon ledger exports (accounts + comparable loan CSVs).
 * Mirrors scripts/import-danske-account-csvs.mjs semantics for row filtering.
 */

export type DanskeLedgerRow = {
  date: string;
  description: string;
  amount: number;
  saldo: number;
};

function parseSemicolonLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inq = false;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      if (inq && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inq = !inq;
      i++;
      continue;
    }
    if (!inq && c === ";") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

export function parseSwedishAmount(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return NaN;
  const neg = s.startsWith("-");
  const t = neg ? s.slice(1) : s;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return neg ? -n : n;
}

export type ParseDanskeLedgerResult = {
  variant: "six" | "seven" | "unknown";
  rows: DanskeLedgerRow[];
};

/** Encodings other than UTF-8 are common — decode with Latin-1/Windows-1252 before parsing. */
export function parseDanskeLedgerCsv(text: string): ParseDanskeLedgerResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { variant: "unknown", rows: [] };
  const header = parseSemicolonLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  const hasValuta = header.includes("Valuta");
  const idx = {
    date: header.indexOf("Bokföringsdag"),
    spec: header.indexOf("Specifikation"),
    amount: header.indexOf("Belopp"),
    saldo: header.indexOf("Saldo"),
    status: header.indexOf("Status"),
  };
  if (idx.date < 0 || idx.spec < 0 || idx.amount < 0 || idx.saldo < 0) {
    throw new Error(
      'Not recognized as Danske-format CSV (needs columns Bokföringsdag; Specifikation; Belopp; Saldo …). Try saving as UTF-8 or Excel "CSV (Semicolon)".',
    );
  }
  const rows: DanskeLedgerRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseSemicolonLine(lines[li]).map((c) => c.replace(/^"|"$/g, ""));
    const status = cols[idx.status] ?? "";
    if (status && status !== "Utförd") continue;
    rows.push({
      date: cols[idx.date],
      description: cols[idx.spec],
      amount: parseSwedishAmount(cols[idx.amount]),
      saldo: parseSwedishAmount(cols[idx.saldo]),
    });
  }
  return { variant: hasValuta ? "seven" : "six", rows };
}

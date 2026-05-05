import Papa from "papaparse";

/** Stable batch tag — re-import archives prior rows with this batch id. */
export const RENOVATION_EXPENSES_IMPORT_BATCH = "docs_bank_expenses_csv";

export type RenovationCsvLine = {
  project: string;
  descriptionRaw: string;
  descriptionDisplay: string;
  amount: number;
  isRefund: boolean;
  /** Parsed from description when present; otherwise import fills from default date. */
  dateIso: string | null;
};

function normalizeHeaderKey(key: string): string {
  return key.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function resolveColumns(sampleRow: Record<string, string>): {
  roomKey: string;
  itemsKey: string;
  costKey: string;
} | null {
  const keys = Object.keys(sampleRow);
  if (keys.length === 0) return null;

  const norm = (k: string) => normalizeHeaderKey(k);
  const normKeys = keys.map((k) => ({ raw: k, n: norm(k) }));

  const roomKey = normKeys.find(({ n }) => n === "room")?.raw ?? keys[0];
  const itemsKey =
    normKeys.find(({ n }) => n === "items")?.raw ??
    normKeys.find(({ n }) => n.includes("item"))?.raw ??
    keys[1];

  const costKey =
    normKeys.find(({ n }) => n.includes("paid") || n.includes("cost"))?.raw ??
    keys.find((k, i) => i >= 2 && k !== roomKey && k !== itemsKey) ??
    keys[keys.length - 1];

  return { roomKey, itemsKey, costKey };
}

/** Parse Swedish-style amounts: kr1.234,56, -kr740,00, "15 500,00". */
export function parseSwedishKrAmount(raw: string): { amount: number; isRefund: boolean } | null {
  const t = raw.replace(/^\uFEFF/, "").trim();
  if (!t || t === "?") return null;

  let s = t.replace(/\s+/g, "");
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/^kr/i, "");

  // Thousands `.`, decimal `,`
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;

  const amount = Math.abs(n);
  const isRefund = neg;
  return { amount, isRefund };
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00`);
  return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

/** Pull ISO date out of free-text labels (store receipts, etc.). */
export function extractDateFromDescription(text: string): { cleaned: string; iso: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { cleaned: "", iso: null };

  const isoHit = trimmed.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoHit) {
    const iso = isoHit[1];
    const [y, mo, d] = iso.split("-").map(Number);
    if (isValidYmd(y, mo, d)) {
      return {
        cleaned: trimmed.replace(isoHit[0], "").replace(/\s+/g, " ").trim(),
        iso,
      };
    }
  }

  const compact = trimmed.match(/\b(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (compact) {
    const y = Number(compact[1]);
    const mo = Number(compact[2]);
    const d = Number(compact[3]);
    if (isValidYmd(y, mo, d)) {
      const iso = `${compact[1]}-${compact[2]}-${compact[3]}`;
      return {
        cleaned: trimmed.replace(compact[0], "").replace(/\s+/g, " ").trim(),
        iso,
      };
    }
  }

  return { cleaned: trimmed, iso: null };
}

export function parseRenovationExpensesCsv(csvText: string): RenovationCsvLine[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0]?.message ?? "Could not parse CSV");
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
  if (rows.length === 0) return [];

  const cols = resolveColumns(rows[0]);
  if (!cols) return [];

  const out: RenovationCsvLine[] = [];
  let currentProject = "General";

  for (const row of rows) {
    const room = String(row[cols.roomKey] ?? "").trim();
    const items = String(row[cols.itemsKey] ?? "").trim();
    const costRaw = String(row[cols.costKey] ?? "").trim();

    if (room) currentProject = room;

    const parsedAmount = parseSwedishKrAmount(costRaw);
    if (!parsedAmount || parsedAmount.amount <= 0) continue;

    const { cleaned, iso } = extractDateFromDescription(items);
    const descriptionDisplay = (cleaned || items || "(No description)").trim();

    out.push({
      project: currentProject,
      descriptionRaw: items,
      descriptionDisplay,
      amount: parsedAmount.amount,
      isRefund: parsedAmount.isRefund,
      dateIso: iso,
    });
  }

  return out;
}

export function isRenovationImportCashflow(cf: { archived_at: string | null; metadata: unknown }): boolean {
  if (cf.archived_at) return false;
  const m = cf.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  return (m as Record<string, unknown>).renovation_import === true;
}

export function renovationImportBatchMatches(cf: { metadata: unknown }, batch: string): boolean {
  const m = cf.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  return (m as Record<string, unknown>).renovation_import_batch === batch;
}

export function renovationProjectSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\da-z]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "project"
  );
}

export function renovationExpenseCardId(projectDisplayName: string): string {
  return `reno-${renovationProjectSlug(projectDisplayName)}`;
}

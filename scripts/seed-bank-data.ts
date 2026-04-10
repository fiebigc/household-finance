/**
 * Seeds bank_accounts + bank_transactions via Supabase REST API.
 *
 * Usage:  npx tsx scripts/seed-bank-data.ts
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SEED_OWNER_USER_ID = process.env.SEED_OWNER_USER_ID;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!SEED_OWNER_USER_ID) {
  console.error(
    "Missing SEED_OWNER_USER_ID. Set it to your Supabase auth user UUID (Dashboard → Authentication → Users).",
  );
  process.exit(1);
}

// ── CSV parsing (standalone, mirrors src/data/bankCsvParse.ts) ──

function parseSwedishNumber(cell: string): number | null {
  const t = cell.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function splitLine(line: string): string[] {
  return line.split(";").map((p) => p.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

type Row = { dateStr: string; spec: string; belopp: number; saldo: number | null };

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const hdr = splitLine(lines[0]);
  const di = hdr.findIndex((h) => /bokf.ringsdag/i.test(h));
  const si = hdr.findIndex((h) => /specifikation/i.test(h));
  const bi = hdr.findIndex((h) => /belopp/i.test(h));
  const ai = hdr.findIndex((h) => /saldo/i.test(h));
  const xi = hdr.findIndex((h) => /status/i.test(h));
  if (di < 0 || si < 0 || bi < 0) return [];
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    const d = c[di]?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (xi >= 0 && !/utf.rd/i.test(c[xi]?.trim() ?? "")) continue;
    const b = parseSwedishNumber(c[bi] ?? "");
    if (b === null) continue;
    out.push({ dateStr: d, spec: c[si]?.trim() ?? "", belopp: b, saldo: ai >= 0 ? parseSwedishNumber(c[ai] ?? "") : null });
  }
  return out;
}

// ── Account defs ──

const ACCOUNTS = [
  { id: "christian-24890618775", file: "AccountChristian-24890618775-20260408.csv", label: "Christian personal", owners: ["christian"], category: "checking" },
  { id: "household-12110506350", file: "AccountHousehold-12110506350-20260408.csv", label: "Household everyday", owners: ["joint"], category: "household_cash" },
  { id: "shared-24890598057", file: "AccountShared-24890598057-20260408.csv", label: "Shared joint", owners: ["joint"], category: "joint_cash" },
  { id: "mastercard-guld-24890598081", file: "MastercardGuld-24890598081-20260408.csv", label: "Mastercard Guld", owners: ["christian"], category: "credit_card" },
  { id: "bolan-fast-24500343776-buffer", file: "Bol}nFastHypotek-24500343776-20260408.csv", label: "Mortgage buffer", owners: ["joint"], category: "mortgage_savings" },
  { id: "bolan-prem-24500343784", file: "Bol}nPremHypotek-24500343784-20260408.csv", label: "Loan Prem (interest-only)", owners: ["joint"], category: "mortgage_debt" },
];

// ── REST helpers ──

async function post(table: string, rows: Record<string, unknown>[], upsert = false) {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (upsert) headers["Prefer"] = "resolution=merge-duplicates";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!res.ok) throw new Error(`POST /${table} ${res.status}: ${await res.text()}`);
}

async function del(table: string, filter: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`DELETE /${table} ${res.status}: ${await res.text()}`);
}

// ── Main ──

async function main() {
  const dir = path.resolve(import.meta.dirname, "../docs/bank");

  console.log("Clearing existing data…");
  await del("bank_transactions", "id=gt.0");
  await del("bank_accounts", "id=neq.___");

  console.log("Inserting bank_accounts…");
  const acctRows = ACCOUNTS.map((a) => {
    const fp = path.join(dir, a.file);
    const parsed = fs.existsSync(fp) ? parseCsv(fs.readFileSync(fp, "latin1")) : [];
    return {
      id: a.id,
      user_id: SEED_OWNER_USER_ID,
      source_file: a.file,
      label: a.label,
      balance_sek: parsed[0]?.saldo ?? null,
      owners: a.owners,
      category: a.category,
      import_date: "2026-04-08",
    };
  });
  await post("bank_accounts", acctRows, true);
  console.log(`  → ${acctRows.length} accounts`);

  let total = 0;
  for (const a of ACCOUNTS) {
    const fp = path.join(dir, a.file);
    if (!fs.existsSync(fp)) { console.log(`  ⚠ ${a.file} not found`); continue; }
    const rows = parseCsv(fs.readFileSync(fp, "latin1"));
    if (!rows.length) { console.log(`  ⚠ ${a.file}: 0 rows`); continue; }

    const txRows = rows.map((r) => ({
      bank_account_id: a.id,
      transaction_date: r.dateStr,
      specifikation: r.spec,
      belopp: r.belopp,
      saldo: r.saldo,
    }));

    for (let i = 0; i < txRows.length; i += 500) {
      await post("bank_transactions", txRows.slice(i, i + 500));
    }
    total += rows.length;
    console.log(`  → ${a.label}: ${rows.length} transactions`);
  }
  console.log(`\nDone: ${acctRows.length} accounts, ${total} transactions.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

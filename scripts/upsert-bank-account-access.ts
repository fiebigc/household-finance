/**
 * Upserts public.bank_account_access only (no delete of accounts/transactions).
 * Uses SEED_OWNER_USER_ID, SEED_BANK_ACCESS_USER_IDS, SEED_BANK_ACCESS_SCOPE from .env
 * (same semantics as scripts/seed-bank-data.ts).
 *
 * Usage: npx tsx scripts/upsert-bank-account-access.ts
 */
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SEED_OWNER_USER_ID = process.env.SEED_OWNER_USER_ID;
const SEED_BANK_ACCESS_USER_IDS = (process.env.SEED_BANK_ACCESS_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SEED_BANK_ACCESS_SCOPE = (process.env.SEED_BANK_ACCESS_SCOPE ?? "all").toLowerCase();

const ACCOUNTS = [
  { id: "christian-24890618775", owners: ["christian"] as const },
  { id: "household-12110506350", owners: ["joint"] as const },
  { id: "shared-24890598057", owners: ["joint"] as const },
  { id: "mastercard-guld-24890598081", owners: ["christian"] as const },
  { id: "bolan-fast-24500343776-buffer", owners: ["joint"] as const },
  { id: "bolan-prem-24500343784", owners: ["joint"] as const },
];

async function post(table: string, rows: Record<string, unknown>[], upsert = false) {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (upsert) headers["Prefer"] = "resolution=merge-duplicates";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`POST /${table} ${res.status}: ${await res.text()}`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!SEED_OWNER_USER_ID) {
    console.error("Missing SEED_OWNER_USER_ID");
    process.exit(1);
  }
  if (SEED_BANK_ACCESS_USER_IDS.length === 0) {
    console.error("Missing SEED_BANK_ACCESS_USER_IDS (comma-separated UUIDs)");
    process.exit(1);
  }

  const accountIds =
    SEED_BANK_ACCESS_SCOPE === "joint"
      ? ACCOUNTS.filter((a) => a.owners.includes("joint")).map((a) => a.id)
      : ACCOUNTS.map((a) => a.id);

  const rows: { bank_account_id: string; user_id: string }[] = [];
  for (const uid of SEED_BANK_ACCESS_USER_IDS) {
    if (uid === SEED_OWNER_USER_ID) continue;
    for (const bank_account_id of accountIds) {
      rows.push({ bank_account_id, user_id: uid });
    }
  }

  if (rows.length === 0) {
    console.log("Nothing to insert (all access IDs match owner).");
    return;
  }

  await post("bank_account_access", rows, true);
  console.log(`Upserted ${rows.length} bank_account_access rows (scope=${SEED_BANK_ACCESS_SCOPE}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

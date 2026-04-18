import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalTransactionSourceKey,
  parseCsvRowsDetailed,
  type ParsedBankRow,
} from "./swedishBankCsv";

const CHUNK_SIZE = 400;

export type BankCsvImportRowPayload = {
  booked_date: string;
  amount_sek: string;
  specification: string;
  spec_canonical: string;
  dedupe_key: string;
};

async function sha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** öre-rounded amount avoids float noise in dedupe keys. */
function amountFingerprint(amountSek: number): string {
  return String(Math.round(amountSek * 100));
}

/**
 * Same booking date + same signed amount + same canonical source => duplicate across imports.
 */
export async function computeBankTransactionDedupeKey(params: {
  householdId: string;
  bankAccountId: string;
  /** YYYY-MM-DD */
  bookedDateIso: string;
  amountSek: number;
  specification: string;
}): Promise<string> {
  const canon = canonicalTransactionSourceKey(params.specification);
  const payload = [
    params.householdId,
    params.bankAccountId,
    params.bookedDateIso,
    amountFingerprint(params.amountSek),
    canon,
  ].join("|");
  return sha256Hex(payload);
}

export function parseSwedishBankExportForImport(
  csvRaw: string,
  bankAccountId: string,
): ParsedBankRow[] {
  return parseCsvRowsDetailed(csvRaw, bankAccountId);
}

export async function buildImportPayloadRows(
  rows: ParsedBankRow[],
  householdId: string,
  bankAccountId: string,
): Promise<BankCsvImportRowPayload[]> {
  const out: BankCsvImportRowPayload[] = [];
  for (const r of rows) {
    const booked = r.dateIso.slice(0, 10);
    const specCanon = canonicalTransactionSourceKey(r.specification);
    const dedupe_key = await computeBankTransactionDedupeKey({
      householdId,
      bankAccountId,
      bookedDateIso: booked,
      amountSek: r.amountSek,
      specification: r.specification,
    });
    out.push({
      booked_date: booked,
      amount_sek: r.amountSek.toFixed(2),
      specification: r.specification,
      spec_canonical: specCanon,
      dedupe_key,
    });
  }
  return out;
}

export type BankCsvImportApplyResult = {
  inserted: number;
  skipped: number;
  parsed: number;
};

export async function refreshBankTransactionRecurringFlags(
  supabase: SupabaseClient,
  householdId: string,
): Promise<void> {
  const { error } = await supabase.rpc("refresh_bank_transaction_recurring_flags", {
    p_household_id: householdId,
  });
  if (error) throw error;
}

/**
 * Inserts new transaction lines (skips exact duplicates) and updates recurring flags once at the end.
 */
export async function importBankCsvRowsToSupabase(params: {
  supabase: SupabaseClient;
  householdId: string;
  bankAccountId: string;
  importBatchId: string;
  csvText: string;
}): Promise<{
  parsed: number;
  inserted: number;
  skipped: number;
}> {
  const rows = parseSwedishBankExportForImport(params.csvText, params.bankAccountId);
  const payloads = await buildImportPayloadRows(rows, params.householdId, params.bankAccountId);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE);
    const { data, error } = await params.supabase.rpc("bank_csv_import_apply", {
      p_household_id: params.householdId,
      p_bank_account_id: params.bankAccountId,
      p_import_batch_id: params.importBatchId,
      p_rows: chunk,
    });
    if (error) throw error;
    const row = data as { inserted?: number; skipped?: number; parsed?: number } | null;
    inserted += Number(row?.inserted ?? 0);
    skipped += Number(row?.skipped ?? 0);
  }

  await refreshBankTransactionRecurringFlags(params.supabase, params.householdId);

  return {
    parsed: payloads.length,
    inserted,
    skipped,
  };
}

/** Creates an import batch row, runs the importer, and stores aggregate counts on the batch. */
export async function runBankCsvImportWithBatch(params: {
  supabase: SupabaseClient;
  householdId: string;
  bankAccountId: string;
  sourceLabel: string;
  csvText: string;
}): Promise<{ batchId: string; parsed: number; inserted: number; skipped: number }> {
  const { data: batchRow, error: batchErr } = await params.supabase
    .from("app_bank_import_batches")
    .insert({
      household_id: params.householdId,
      source_label: params.sourceLabel,
      rows_parsed: 0,
      rows_inserted: 0,
      rows_skipped_duplicate: 0,
    })
    .select("id")
    .single();

  if (batchErr) throw batchErr;
  const batchId = batchRow?.id as string;
  if (!batchId) throw new Error("Import batch insert returned no id");

  const result = await importBankCsvRowsToSupabase({
    supabase: params.supabase,
    householdId: params.householdId,
    bankAccountId: params.bankAccountId,
    importBatchId: batchId,
    csvText: params.csvText,
  });

  const { error: updErr } = await params.supabase
    .from("app_bank_import_batches")
    .update({
      rows_parsed: result.parsed,
      rows_inserted: result.inserted,
      rows_skipped_duplicate: result.skipped,
    })
    .eq("id", batchId);

  if (updErr) throw updErr;

  return { batchId, ...result };
}

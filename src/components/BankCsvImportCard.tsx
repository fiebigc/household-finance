import { useCallback, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/appDataService";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { formatUnknownError } from "@/lib/utils";
import type { BankAccountRecord } from "@/data/bankData";
import { runBankCsvImportWithBatch } from "@/utils/finance/bankCsvImport";

interface Props {
  accounts: BankAccountRecord[];
  /** Called after a successful import so charts can refetch Supabase-backed series. */
  onImportComplete?: () => void;
}

export function BankCsvImportCard({ accounts, onImportComplete }: Props) {
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "reading" | "uploading" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const importable = useMemo(
    () => accounts.filter((a) => a.category === "bank" || a.category === "credit"),
    [accounts],
  );

  const onPickFile = useCallback((f: File | null) => {
    setPendingFile(f);
    setFileName(f?.name ?? "");
    setStatus("idle");
    setMessage("");
  }, []);

  const runImport = useCallback(async () => {
    if (!hasSupabaseEnv || !supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    if (!bankAccountId || !pendingFile) {
      setStatus("error");
      setMessage("Choose an account and a CSV file.");
      return;
    }

    setStatus("reading");
    setMessage("");
    let text: string;
    try {
      text = await pendingFile.text();
    } catch {
      setStatus("error");
      setMessage("Could not read the file.");
      return;
    }

    setStatus("uploading");
    try {
      const result = await runBankCsvImportWithBatch({
        supabase,
        householdId: DEFAULT_HOUSEHOLD_ID,
        bankAccountId,
        sourceLabel: pendingFile.name,
        csvText: text,
      });
      setStatus("done");
      setMessage(
        `Imported ${result.inserted} new rows (${result.skipped} duplicates skipped, ${result.parsed} lines parsed). Recurring flags refreshed for budgeting.`,
      );
      onImportComplete?.();
    } catch (e) {
      console.error("[BankCsvImport]", e);
      setStatus("error");
      setMessage(formatUnknownError(e));
    }
  }, [bankAccountId, pendingFile, onImportComplete]);

  if (!hasSupabaseEnv) {
    return (
      <Card className="bento-span-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bank CSV import</CardTitle>
          <CardDescription>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to import transactions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bento-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Bank CSV import</CardTitle>
        <CardDescription>
          Upload a Swedish bank export (semicolon CSV). Rows already stored (same date, amount, and
          source) are skipped. Same source and amount on different dates are flagged as recurring for
          budgeting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="csv-account">Account</Label>
          <select
            id="csv-account"
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            <option value="">Select account…</option>
            {importable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.accountNumber})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="csv-file">Export file</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="max-w-full text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <span className="text-xs text-muted-foreground">{fileName}</span>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          className="gap-2"
          disabled={status === "reading" || status === "uploading" || !bankAccountId || !pendingFile}
          onClick={() => void runImport()}
        >
          <Upload className="h-4 w-4" aria-hidden />
          {status === "reading" || status === "uploading" ? "Importing…" : "Import to Supabase"}
        </Button>

        {message ? (
          <p
            className={
              status === "error"
                ? "text-sm text-finance-expense"
                : "text-sm text-muted-foreground"
            }
            role="status"
          >
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

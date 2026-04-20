import { useCallback, useEffect, useMemo, useState } from "react";
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
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { formatUnknownError } from "@/lib/utils";
import type { BankAccountRecord, EntityRecord } from "@/data/bankData";
import { runBankCsvImportWithBatch } from "@/utils/finance/bankCsvImport";
import { cn } from "@/lib/utils";

function entityDisplayName(entities: readonly EntityRecord[], entityId: string): string {
  const e = entities.find((x) => x.id === entityId);
  const n = e?.name?.trim();
  return n || "Unknown";
}

const ENTITY_TYPE_ORDER: Record<EntityRecord["type"], number> = {
  adult: 0,
  child: 1,
  shared: 2,
  company: 99,
};

interface Props {
  householdId: string;
  accounts: BankAccountRecord[];
  /** Household members (names shown for account owner and import link). */
  entities: EntityRecord[];
  /**
   * Persist account owner before import so Supabase matches the person you chose.
   * Should upsert bank accounts (e.g. `saveCurrentFinanceState`).
   */
  onLinkBankAccountToEntity: (accountId: string, entityId: string) => Promise<void>;
  /** Called after a successful import so charts can refetch Supabase-backed series. */
  onImportComplete?: () => void;
  /** Override outer Card classes (e.g. in Settings modal). */
  cardClassName?: string;
}

export function BankCsvImportCard({
  householdId,
  accounts,
  entities,
  onLinkBankAccountToEntity,
  onImportComplete,
  cardClassName,
}: Props) {
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
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

  const linkableEntities = useMemo(() => {
    return entities
      .filter((e) => e.type === "adult" || e.type === "child" || e.type === "shared")
      .slice()
      .sort(
        (a, b) =>
          (ENTITY_TYPE_ORDER[a.type] ?? 99) - (ENTITY_TYPE_ORDER[b.type] ?? 99) ||
          a.name.localeCompare(b.name, "sv"),
      );
  }, [entities]);

  const onPickFile = useCallback((f: File | null) => {
    setPendingFile(f);
    setFileName(f?.name ?? "");
    setStatus("idle");
    setMessage("");
  }, []);

  useEffect(() => {
    if (!linkableEntities.length) {
      setSelectedEntityId("");
      return;
    }
    const acc = importable.find((a) => a.id === bankAccountId);
    const ownerId = acc?.ownerEntityId;
    const ownerOk = ownerId && linkableEntities.some((e) => e.id === ownerId);
    if (ownerOk) {
      setSelectedEntityId(ownerId);
      return;
    }
    setSelectedEntityId((prev) =>
      prev && linkableEntities.some((e) => e.id === prev)
        ? prev
        : (linkableEntities[0]?.id ?? ""),
    );
  }, [bankAccountId, importable, linkableEntities]);

  /** Persist account owner as soon as account + person are chosen (no need to wait for Import). */
  useEffect(() => {
    if (!hasSupabaseEnv || !bankAccountId || !selectedEntityId || linkableEntities.length === 0) {
      return;
    }
    const acc = importable.find((a) => a.id === bankAccountId);
    if (!acc || acc.category === "loan") return;
    if (acc.ownerEntityId === selectedEntityId) return;

    const t = window.setTimeout(() => {
      void onLinkBankAccountToEntity(bankAccountId, selectedEntityId).catch((e) => {
        console.error("[BankCsvImport] auto-link save:", e);
      });
    }, 500);

    return () => window.clearTimeout(t);
  }, [
    bankAccountId,
    selectedEntityId,
    importable,
    linkableEntities.length,
    onLinkBankAccountToEntity,
  ]);

  const runImport = useCallback(async () => {
    if (!hasSupabaseEnv || !supabase) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }
    if (!householdId) {
      setStatus("error");
      setMessage("No household id for this session.");
      return;
    }
    if (!bankAccountId || !pendingFile) {
      setStatus("error");
      setMessage("Choose an account and a CSV file.");
      return;
    }
    if (linkableEntities.length > 0 && !selectedEntityId) {
      setStatus("error");
      setMessage("Choose who this account’s data belongs to.");
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
      const acc = importable.find((a) => a.id === bankAccountId);
      if (selectedEntityId && acc && acc.ownerEntityId !== selectedEntityId) {
        await onLinkBankAccountToEntity(bankAccountId, selectedEntityId);
      }
      const result = await runBankCsvImportWithBatch({
        supabase,
        householdId,
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
  }, [
    bankAccountId,
    pendingFile,
    selectedEntityId,
    importable,
    linkableEntities.length,
    onImportComplete,
    onLinkBankAccountToEntity,
    householdId,
  ]);

  if (!hasSupabaseEnv) {
    return (
      <Card className={cn(cardClassName ?? "bento-span-full")}>
        <CardHeader className="pb-2">
          <CardTitle>Bank CSV import</CardTitle>
          <CardDescription>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to import transactions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={cn(cardClassName ?? "bento-span-full")}>
      <CardHeader className="pb-2">
        <CardTitle>Bank CSV import</CardTitle>
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
                {a.name} ({a.accountNumber}) — {entityDisplayName(entities, a.ownerEntityId)}
              </option>
            ))}
          </select>
        </div>

        {linkableEntities.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="csv-entity">Link this import to</Label>
            <select
              id="csv-entity"
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
            >
              <option value="">Select person…</option>
              {linkableEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name.trim() || "Unnamed"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The chosen account is saved as belonging to this person before rows are imported.
            </p>
          </div>
        ) : null}

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
          disabled={
            status === "reading" ||
            status === "uploading" ||
            !householdId ||
            !bankAccountId ||
            !pendingFile ||
            (linkableEntities.length > 0 && !selectedEntityId)
          }
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

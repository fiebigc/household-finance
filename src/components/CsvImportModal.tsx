import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { cn } from "@/lib/utils";
import { parseDanskeLedgerCsv } from "@/utils/danskeLedgerCsv";
import type { Transaction } from "@/types/schema";
import { isCsvImportEligibleAccount } from "@/utils/csvImportEligible";

async function deterministicTxId(parts: string): Promise<string> {
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  const h = Array.from(new Uint8Array(dig), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function decodeCsvFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file); // Prefer UTF-8; Latin-1 files often still decode for semicolon ASCII headers
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-select account when launched from edit form (account / loan-linked account). */
  presetAccountId: string | null;
};

export function CsvImportModal({ open, onClose, presetAccountId }: Props) {
  const { household, accounts, refresh } = useAppStore();
  const backend = useBackend();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetAccounts = useMemo(() => {
    return accounts
      .filter((a) => isCsvImportEligibleAccount(a))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setError(null);
    setBusy(false);
    const preset =
      presetAccountId && targetAccounts.some((a) => a.id === presetAccountId)
        ? presetAccountId
        : targetAccounts[0]?.id ?? "";
    setSelectedAccountId(preset);
  }, [open, presetAccountId, targetAccounts]);

  const importFile = useCallback(
    async (file: File) => {
      if (!household || !selectedAccountId) {
        setError("Select an account or create a household first.");
        return;
      }
      setBusy(true);
      setMessage(null);
      setError(null);
      try {
        const rawText = await decodeCsvFileAsText(file);
        const { rows } = parseDanskeLedgerCsv(rawText);
        if (rows.length === 0) {
          setError("No importable rows (check header and Utförd / empty Status on rows).");
          return;
        }
        const chronological = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        const sortedDesc = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const latest = sortedDesc[0];
        if (!Number.isFinite(latest.saldo)) {
          setError("Could not parse running balance (Saldo) from the CSV.");
          return;
        }

        const acc = accounts.find((a) => a.id === selectedAccountId);
        if (!acc) {
          setError("Selected account no longer exists.");
          return;
        }

        const now = new Date().toISOString();
        const batch = `csv-import-${now.slice(0, 10)}`;
        const txs: Omit<Transaction, "created_at">[] = [];
        let seq = 0;
        for (const r of chronological) {
          const idSeed = `${selectedAccountId}:${r.date}:${seq++}:${r.amount}:${r.description.slice(0, 80)}`;
          txs.push({
            id: await deterministicTxId(`tx:inapp:${idSeed}`),
            account_id: selectedAccountId,
            import_batch_id: null,
            date: r.date,
            amount: r.amount,
            currency: household.currency,
            description: r.description,
            category: null,
            cashflow_id: null,
            is_reviewed: false,
            notes: batch,
          });
        }

        await backend.insertTransactions(txs);

        await backend.upsertAccount({
          ...acc,
          balance_snapshot:
            acc.type === "loan" ? -Math.abs(latest.saldo) : Number.isFinite(latest.saldo) ? latest.saldo : acc.balance_snapshot,
          balance_snapshot_date: latest.date.trim() ? latest.date : acc.balance_snapshot_date,
          updated_at: now,
        });

        await refresh();
        setMessage(`Imported ${txs.length} rows into "${acc.name}" and refreshed balance snapshot.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setBusy(false);
      }
    },
    [accounts, backend, household, refresh, selectedAccountId],
  );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void importFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv")) void importFile(f);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close import" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento flex flex-col max-h-[min(90vh,520px)]"
      >
        <div className="flex items-start justify-between gap-2 p-4 border-b border-border/50 shrink-0">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <h2 id="csv-import-title" className="text-sm font-semibold tracking-tight">
                CSV Import
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Danske-format semicolon export: <span className="font-mono text-[10px]">Bokföringsdag</span>,{" "}
                <span className="font-mono text-[10px]">Specifikation</span>, <span className="font-mono text-[10px]">Belopp</span>
                , <span className="font-mono text-[10px]">Saldo</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs">
          <label className="block space-y-1">
            <span className="text-[10px] text-muted-foreground">Attach transactions to account</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={busy || targetAccounts.length === 0}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {targetAccounts.length === 0 ? (
                <option value="">No eligible accounts — add bank / savings first</option>
              ) : (
                targetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))
              )}
            </select>
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={onDrop}
            className={cn(
              "rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors",
              busy ? "opacity-60 pointer-events-none" : "hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2 opacity-70" aria-hidden />
            <p className="text-sm font-medium text-card-foreground mb-1">Drop a CSV here</p>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              Rows are keyed by contents — re-uploading the same file updates the same IDs.
            </p>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPickFile} />
            <button
              type="button"
              disabled={busy || !selectedAccountId}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs rounded-bento-inner bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Importing…" : "Choose file"}
            </button>
          </div>

          {message && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p>}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <div className="p-4 pt-0 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted/50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

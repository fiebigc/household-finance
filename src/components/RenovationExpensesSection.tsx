import { useMemo, useState, useEffect } from "react";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { formatSEK, cn } from "@/lib/utils";
import { primaryCashflowAccountId } from "@/utils/cashflowAccounts";
import type { Cashflow } from "@/types/schema";
import { useHouseholdCardValues } from "@/hooks/useHouseholdCardValues";
import bundledRenovationCsv from "../../docs/bank/Expenses.csv?raw";
import {
  parseRenovationExpensesCsv,
  RENOVATION_EXPENSES_IMPORT_BATCH,
  renovationImportBatchMatches,
  isRenovationImportCashflow,
} from "@/utils/renovationExpensesCsv";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Import controls only — wrap in a Bento `Card` on the Expenses tab. */
export function RenovationImportCardContent() {
  const { cashflows, entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const { values, update } = useHouseholdCardValues();

  const adults = useMemo(
    () => entities.filter((e) => e.type === "adult" && !e.archived_at),
    [entities],
  );
  const [entityId, setEntityId] = useState("");
  const persistedDefault = values.expenses.renovationImportDefaultDateYmd;
  const defaultDate =
    typeof persistedDefault === "string" && YMD_RE.test(persistedDefault) ? persistedDefault : todayYmd();

  const setDefaultDate = (ymd: string) => {
    update((v) => ({
      ...v,
      expenses: { ...v.expenses, renovationImportDefaultDateYmd: ymd },
    }));
  };

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedEntity = entityId || adults[0]?.id;

  const handleImportBundledCsv = async () => {
    if (!household || !selectedEntity) {
      setMessage("Add at least one adult under Data & Settings first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const lines = parseRenovationExpensesCsv(bundledRenovationCsv);
      const existing = cashflows.filter((c) => renovationImportBatchMatches(c, RENOVATION_EXPENSES_IMPORT_BATCH));
      for (const c of existing) {
        await backend.archiveCashflow(c.id);
      }

      const now = new Date().toISOString();
      let created = 0;
      for (const line of lines) {
        const amount = line.isRefund ? -line.amount : line.amount;
        const payload: Cashflow = {
          id: crypto.randomUUID(),
          entity_id: selectedEntity,
          account_id: primaryCashflowAccountId({
            entity_id: selectedEntity,
            account_id: null,
            from_account_id: null,
            to_account_id: null,
            direction: "expense",
          } as Cashflow),
          from_account_id: null,
          to_account_id: null,
          direction: "expense",
          category: "other",
          name: line.descriptionDisplay,
          amount,
          currency: household.currency,
          frequency: "one_off",
          date_from: line.dateIso ?? defaultDate,
          date_to: null,
          is_gross: false,
          tax_rate_override: null,
          notes: `Renovation · ${line.project}`,
          employment_active_from: null,
          employment_active_until: null,
          metadata: {
            renovation_import: true,
            renovation_import_batch: RENOVATION_EXPENSES_IMPORT_BATCH,
            renovation_project: line.project,
            renovation_refund: line.isRefund,
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        };
        await backend.upsertCashflow(payload);
        created += 1;
      }

      await refresh();
      setMessage(
        `Imported ${created} one-off expense rows across ${new Set(lines.map((l) => l.project)).size} projects.`,
      );
    } catch (e) {
      console.error(e);
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!household) return <p className="text-xs text-muted-foreground">No household loaded.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-bento-inner border border-border/40 bg-muted/20 px-3 py-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import</p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Assign to adult entity</label>
            <select
              value={selectedEntity ?? ""}
              onChange={(ev) => setEntityId(ev.target.value)}
              disabled={busy || adults.length === 0}
              className="min-w-[180px] px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {adults.length === 0 ? (
                <option value="">No adults — add under Data & Settings</option>
              ) : (
                adults.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Default date when CSV has none</label>
            <input
              type="date"
              value={defaultDate}
              onChange={(ev) => setDefaultDate(ev.target.value)}
              disabled={busy}
              className="px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            disabled={busy || adults.length === 0}
            onClick={() => void handleImportBundledCsv()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {busy ? "Working…" : "Import bundled CSV"}
          </button>
        </div>
      </div>
      {message && (
        <p
          className={`text-xs ${message.startsWith("Imported") ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function formatRenovationRowAmount(c: Cashflow): string {
  if (c.direction !== "expense") return formatSEK(Math.abs(c.amount));
  if (c.amount < 0) return `+${formatSEK(Math.abs(c.amount))}`;
  return `−${formatSEK(c.amount)}`;
}

function readRenovationMeta(cf: Cashflow): Record<string, unknown> {
  const m = cf.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  return { ...(m as Record<string, unknown>) };
}

export function RenovationProjectCardEditDialog({
  open,
  onClose,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
}) {
  const { cashflows, household, refresh } = useAppStore();
  const backend = useBackend();
  const [titleInput, setTitleInput] = useState("");
  const [applyBulkDate, setApplyBulkDate] = useState(false);
  const [bulkDateYmd, setBulkDateYmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flows = useMemo(() => {
    return cashflows.filter((c) => {
      if (!isRenovationImportCashflow(c)) return false;
      const m = c.metadata as Record<string, unknown>;
      return m.renovation_project === projectName;
    });
  }, [cashflows, projectName]);

  useEffect(() => {
    if (!open) return;
    setTitleInput(projectName);
    setApplyBulkDate(false);
    const sorted = [...flows].sort((a, b) => b.date_from.localeCompare(a.date_from));
    setBulkDateYmd(sorted[0]?.date_from.slice(0, 10) ?? todayYmd());
    setError(null);
  }, [open, projectName, flows]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSave = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed) {
      setError("Enter a project name.");
      return;
    }
    if (!household || flows.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const dateApply = applyBulkDate ? bulkDateYmd : null;
      for (const cf of flows) {
        const nextMeta = readRenovationMeta(cf);
        nextMeta.renovation_import = true;
        nextMeta.renovation_project = trimmed;
        await backend.upsertCashflow({
          ...cf,
          date_from: dateApply && YMD_RE.test(dateApply) ? dateApply : cf.date_from,
          metadata: nextMeta,
          notes: `Renovation · ${trimmed}`,
          updated_at: now,
        });
      }
      await refresh();
      onClose();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reno-project-edit-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="reno-project-edit-title" className="text-sm font-semibold">
              Edit renovation project
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Rename updates every line in this card. Optionally set one date for all lines.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-card-foreground">Project name</span>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyBulkDate}
              disabled={busy}
              onChange={(e) => setApplyBulkDate(e.target.checked)}
              className="mt-1 rounded border-border"
            />
            <span className="text-xs text-card-foreground leading-snug">
              Set the same date on every line in this project
            </span>
          </label>

          <label className={`block space-y-1 ${!applyBulkDate ? "opacity-50 pointer-events-none" : ""}`}>
            <span className="text-xs font-medium text-card-foreground">Date for all lines</span>
            <input
              type="date"
              value={bulkDateYmd}
              onChange={(e) => setBulkDateYmd(e.target.value)}
              disabled={busy || !applyBulkDate}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RenovationImportCardEditDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { values, update } = useHouseholdCardValues();
  const [titleInput, setTitleInput] = useState("");
  const [defaultDateYmd, setDefaultDateYmd] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitleInput(values.expenses.renovationImportCardTitleOverride);
    const persisted = values.expenses.renovationImportDefaultDateYmd;
    setDefaultDateYmd(typeof persisted === "string" && YMD_RE.test(persisted) ? persisted : todayYmd());
  }, [open, values.expenses.renovationImportCardTitleOverride, values.expenses.renovationImportDefaultDateYmd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSave = () => {
    update((v) => ({
      ...v,
      expenses: {
        ...v.expenses,
        renovationImportCardTitleOverride: titleInput.trim(),
        renovationImportDefaultDateYmd: defaultDateYmd,
      },
    }));
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reno-import-edit-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="reno-import-edit-title" className="text-sm font-semibold">
              Renovation import card
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Card title is cosmetic. Default date is used for CSV lines without a date in the text.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-card-foreground">Card title</span>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Renovation projects"
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-[10px] text-muted-foreground">Leave empty for the default title.</span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-card-foreground">Default date when CSV has none</span>
            <input
              type="date"
              value={defaultDateYmd}
              onChange={(e) => setDefaultDateYmd(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RenovationExpenseRow({
  cf,
  projectName,
  otherProjectOptions,
  onBusy,
  busy,
}: {
  cf: Cashflow;
  projectName: string;
  otherProjectOptions: string[];
  onBusy: (v: boolean) => void;
  busy: boolean;
}) {
  const { household, refresh } = useAppStore();
  const backend = useBackend();

  const meta = readRenovationMeta(cf);
  const initialRefund = meta.renovation_refund === true || cf.amount < 0;

  const [label, setLabel] = useState(cf.name);
  const [amountStr, setAmountStr] = useState(String(Math.abs(cf.amount)));
  const [refund, setRefund] = useState(initialRefund);
  const [dateStr, setDateStr] = useState(cf.date_from.slice(0, 10));
  const [moveChoice, setMoveChoice] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const m = readRenovationMeta(cf);
    const ref = m.renovation_refund === true || cf.amount < 0;
    setLabel(cf.name);
    setAmountStr(String(Math.abs(cf.amount)));
    setRefund(ref);
    setDateStr(cf.date_from.slice(0, 10));
    setMoveChoice("");
    setNewProjectName("");
    setRowError(null);
    setExpanded(false);
  }, [cf.id, cf.updated_at]);

  const persistRow = async (next: Cashflow) => {
    if (!household) return;
    onBusy(true);
    setRowError(null);
    try {
      await backend.upsertCashflow({
        ...next,
        updated_at: new Date().toISOString(),
      });
      await refresh();
    } catch (e) {
      console.error(e);
      setRowError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      onBusy(false);
    }
  };

  const handleSaveDetails = async () => {
    const raw = Number(amountStr.replace(",", "."));
    if (!Number.isFinite(raw)) {
      setRowError("Enter a valid amount.");
      return;
    }
    const amt = refund ? -Math.abs(raw) : Math.abs(raw);
    const m0 = readRenovationMeta(cf);
    const proj = typeof m0.renovation_project === "string" ? m0.renovation_project : projectName;
    const nextMeta = readRenovationMeta(cf);
    nextMeta.renovation_import = true;
    nextMeta.renovation_project = proj;
    nextMeta.renovation_refund = refund;

    await persistRow({
      ...cf,
      name: label.trim() || cf.name,
      amount: amt,
      date_from: dateStr,
      metadata: nextMeta,
      notes: `Renovation · ${proj}`,
    });
    setExpanded(false);
  };

  const handleMove = async (target: string, explicitNew?: string) => {
    let nextProject = target;
    if (target === "__new__") {
      nextProject = explicitNew?.trim() ?? "";
      if (!nextProject) {
        setRowError("Enter a new project name.");
        return;
      }
    }

    const nextMeta = readRenovationMeta(cf);
    nextMeta.renovation_import = true;
    nextMeta.renovation_project = nextProject;
    nextMeta.renovation_refund = refund;

    await persistRow({
      ...cf,
      metadata: nextMeta,
      notes: `Renovation · ${nextProject}`,
    });
    setMoveChoice("");
    setNewProjectName("");
    setExpanded(false);
  };

  const handleArchive = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this expense from the project? It will no longer appear in totals.")
    ) {
      return;
    }
    onBusy(true);
    setRowError(null);
    try {
      await backend.archiveCashflow(cf.id);
      await refresh();
    } catch (e) {
      console.error(e);
      setRowError(e instanceof Error ? e.message : "Archive failed.");
    } finally {
      onBusy(false);
    }
  };

  const refundVisual =
    readRenovationMeta(cf).renovation_refund === true || cf.amount < 0;

  return (
    <div className="group relative rounded-bento-inner bg-muted/40 px-2.5 py-2 text-xs border border-border/40 focus-within:border-border/80 focus-within:ring-2 focus-within:ring-primary/15">
      {!expanded ? (
        <div className="flex items-center gap-2 min-h-[2.5rem]">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-card-foreground truncate leading-tight">{cf.name}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{cf.date_from.slice(0, 10)}</p>
          </div>
          <span
            className={cn(
              "tabular-nums shrink-0 text-xs font-medium",
              refundVisual ? "text-income" : "text-expense",
            )}
          >
            {formatRenovationRowAmount(cf)}
          </span>
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
              busy && "opacity-40 pointer-events-none",
            )}
          >
            <button
              type="button"
              disabled={busy}
              title="Remove expense"
              onClick={() => void handleArchive()}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              title="Edit line"
              onClick={() => setExpanded(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/80 hover:text-card-foreground"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/30">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Edit line</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setExpanded(false)}
              className="text-[11px] text-muted-foreground hover:text-card-foreground px-2 py-0.5 rounded hover:bg-muted/60"
            >
              Close
            </button>
          </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-1.5 min-w-0">
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wide">Description</label>
          <input
            type="text"
            value={label}
            onChange={(ev) => setLabel(ev.target.value)}
            disabled={busy}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wide">Amount (SEK)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(ev) => setAmountStr(ev.target.value)}
              disabled={busy}
              className="w-24 px-2 py-1.5 rounded-md border border-border bg-background text-xs tabular-nums"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-2 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={refund} disabled={busy} onChange={(ev) => setRefund(ev.target.checked)} />
            Refund
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Date
          <input
            type="date"
            value={dateStr}
            disabled={busy}
            onChange={(ev) => setDateStr(ev.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSaveDetails()}
            className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] hover:opacity-90 disabled:opacity-50"
          >
            Save line
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleArchive()}
            className="px-2.5 py-1 rounded-md border border-destructive/30 text-destructive text-[11px] hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-[11px] text-muted-foreground shrink-0">Move to project</label>
        <select
          value={moveChoice}
          disabled={busy}
          onChange={(ev) => {
            const v = ev.target.value;
            setMoveChoice(v);
            setRowError(null);
            if (!v) return;
            if (v === "__new__") return;
            void handleMove(v);
          }}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border bg-background text-xs"
        >
          <option value="">— Keep on {projectName} —</option>
          {otherProjectOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__new__">New project…</option>
        </select>
      </div>
      {moveChoice === "__new__" && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="New project name"
            value={newProjectName}
            disabled={busy}
            onChange={(ev) => setNewProjectName(ev.target.value)}
            className="flex-1 min-w-[120px] px-2 py-1.5 rounded-md border border-border bg-background text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleMove("__new__", newProjectName)}
            className="px-2.5 py-1 rounded-md bg-muted text-card-foreground text-[11px] disabled:opacity-50"
          >
            Move here
          </button>
        </div>
      )}

      {rowError && <p className="text-[11px] text-destructive">{rowError}</p>}
        </div>
      )}
    </div>
  );
}

function RenovationProjectAddExpenseForm({
  projectName,
  defaultEntityId,
  adults,
  currency,
  disabled,
}: {
  projectName: string;
  defaultEntityId: string;
  adults: { id: string; name: string }[];
  currency: string;
  disabled: boolean;
}) {
  const { household, refresh } = useAppStore();
  const backend = useBackend();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [refund, setRefund] = useState(false);
  const [dateStr, setDateStr] = useState(() => todayYmd());
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntityId(defaultEntityId);
  }, [defaultEntityId]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  const resetFields = () => {
    setLabel("");
    setAmountStr("");
    setRefund(false);
    setDateStr(todayYmd());
  };

  const handleAdd = async () => {
    if (!household) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Enter a description.");
      return;
    }
    const raw = Number(amountStr.replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    const selectedEntity = entityId || defaultEntityId;
    if (!selectedEntity) {
      setError("Add at least one adult under Data & Settings first.");
      return;
    }
    const amount = refund ? -Math.abs(raw) : Math.abs(raw);
    const now = new Date().toISOString();
    setBusy(true);
    setError(null);
    try {
      const skeleton = {
        entity_id: selectedEntity,
        account_id: null,
        from_account_id: null,
        to_account_id: null,
        direction: "expense" as const,
      };
      const payload: Cashflow = {
        id: crypto.randomUUID(),
        entity_id: selectedEntity,
        account_id: primaryCashflowAccountId(skeleton as Cashflow),
        from_account_id: null,
        to_account_id: null,
        direction: "expense",
        category: "other",
        name: trimmed,
        amount,
        currency,
        frequency: "one_off",
        date_from: dateStr,
        date_to: null,
        is_gross: false,
        tax_rate_override: null,
        notes: `Renovation · ${projectName}`,
        employment_active_from: null,
        employment_active_until: null,
        metadata: {
          renovation_import: true,
          renovation_project: projectName,
          renovation_refund: refund,
        },
        created_at: now,
        updated_at: now,
        archived_at: null,
      };
      await backend.upsertCashflow(payload);
      await refresh();
      resetFields();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Could not add expense.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = disabled || busy || !household;
  const noAdults = adults.length === 0;

  return (
    <div className="rounded-bento-inner border border-dashed border-border/50 bg-muted/15 px-2.5 py-2">
      {!open ? (
        <button
          type="button"
          disabled={blocked || noAdults}
          onClick={() => setOpen(true)}
          title={noAdults ? "Add an adult under Data & Settings first" : undefined}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Add expense
        </button>
      ) : (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/30">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              New line
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                resetFields();
                setError(null);
              }}
              className="text-[11px] text-muted-foreground hover:text-card-foreground px-2 py-0.5 rounded hover:bg-muted/60"
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-1 min-w-0">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wide">
                Description
              </label>
              <input
                type="text"
                value={label}
                onChange={(ev) => setLabel(ev.target.value)}
                disabled={blocked}
                placeholder="e.g. Paint, delivery fee"
                className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wide">
                  Amount (SEK)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(ev) => setAmountStr(ev.target.value)}
                  disabled={blocked}
                  className="w-24 px-2 py-1.5 rounded-md border border-border bg-background text-xs tabular-nums"
                />
              </div>
              <label className="flex items-center gap-1.5 pb-2 cursor-pointer whitespace-nowrap text-[11px]">
                <input type="checkbox" checked={refund} disabled={blocked} onChange={(ev) => setRefund(ev.target.checked)} />
                Refund
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Date
              <input
                type="date"
                value={dateStr}
                disabled={blocked}
                onChange={(ev) => setDateStr(ev.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums"
              />
            </label>
            {adults.length > 0 && (
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 flex-1">
                <span className="shrink-0">Entity</span>
                <select
                  value={entityId || defaultEntityId}
                  disabled={blocked}
                  onChange={(ev) => setEntityId(ev.target.value)}
                  className="min-w-0 flex-1 px-2 py-1 rounded-md border border-border bg-background text-xs"
                >
                  {adults.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={blocked || noAdults}
              onClick={() => void handleAdd()}
              className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] hover:opacity-90 disabled:opacity-50 sm:ml-auto"
            >
              {busy ? "Adding…" : "Add to project"}
            </button>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Line editors for one renovation project — used inside a Bento card with drag handle from parent `Card`. */
export function RenovationProjectCardBody({
  projectName,
  flows,
}: {
  projectName: string;
  flows: Cashflow[];
}) {
  const { cashflows, entities, household } = useAppStore();
  const [busy, setBusy] = useState(false);

  const adults = useMemo(
    () =>
      entities
        .filter((e) => e.type === "adult" && !e.archived_at)
        .map((e) => ({ id: e.id, name: e.name })),
    [entities],
  );

  const defaultEntityId = flows[0]?.entity_id ?? adults[0]?.id ?? "";

  const otherProjects = useMemo(() => {
    const names = new Set<string>();
    for (const c of cashflows) {
      if (!isRenovationImportCashflow(c)) continue;
      const m = c.metadata as Record<string, unknown>;
      if (typeof m.renovation_project === "string") names.add(m.renovation_project);
    }
    names.delete(projectName);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [cashflows, projectName]);

  const currency = household?.currency ?? "SEK";

  return (
    <div className="space-y-2 max-h-[min(420px,55vh)] overflow-y-auto overscroll-contain pr-1">
      {flows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No lines on this project yet — add one below or import from CSV.
        </p>
      ) : (
        flows.map((cf) => (
          <RenovationExpenseRow
            key={cf.id}
            cf={cf}
            projectName={projectName}
            otherProjectOptions={otherProjects}
            onBusy={setBusy}
            busy={busy}
          />
        ))
      )}
      <RenovationProjectAddExpenseForm
        projectName={projectName}
        defaultEntityId={defaultEntityId}
        adults={adults}
        currency={currency}
        disabled={busy}
      />
      {busy && <p className="text-[11px] text-muted-foreground">Saving…</p>}
    </div>
  );
}

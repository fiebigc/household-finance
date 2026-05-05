import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type CardNumericFieldDef = {
  key: string;
  label: string;
  hint?: string;
  allowEmpty?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: CardNumericFieldDef[];
  initial: Record<string, number | null>;
  onSave: (next: Record<string, number | null>) => void;
};

export function CardNumericFieldsDialog({
  open,
  onClose,
  title,
  description,
  fields,
  initial,
  onSave,
}: Props) {
  const [raw, setRaw] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = initial[f.key];
      if (v == null && f.allowEmpty) next[f.key] = "";
      else next[f.key] = v == null ? "" : String(v);
    }
    setRaw(next);
  }, [open, initial, fields]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    const out: Record<string, number | null> = {};
    for (const f of fields) {
      const s = raw[f.key]?.trim() ?? "";
      if (s === "") {
        out[f.key] = f.allowEmpty ? null : 0;
        continue;
      }
      const n = Number(s.replace(",", "."));
      out[f.key] = Number.isFinite(n) ? n : 0;
    }
    onSave(out);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento p-5 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-edit-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="card-edit-title" className="text-sm font-semibold">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
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

        <div className="space-y-3 max-h-[min(60vh,420px)] overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className="text-xs font-medium text-card-foreground">{f.label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={raw[f.key] ?? ""}
                onChange={(e) => setRaw((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {f.hint && <span className="text-[10px] text-muted-foreground">{f.hint}</span>}
            </label>
          ))}
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

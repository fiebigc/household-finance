import {
  DndContext,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { Building2, ChevronDown, ChevronRight, GripVertical, Plus, Trash2, User } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/i18n/I18nContext";
import type { ExpenseItem, IncomeStream, Persona, PersonaWorkParams } from "@/lib/cashflow";
import { DEFAULT_WORK_PARAMS, effectiveMonthlyGross } from "@/lib/cashflow";
import { computeBenefitBreakdown, type BenefitBreakdown } from "@/lib/swedishBenefits2026";
import type { PersonaSetting } from "@/hooks/usePersonaSettings";
import { stockholmTabellMonthlyNetFromMonthlyGrossCombined } from "@/lib/swedenStockholmTax";
import { cn } from "@/lib/utils";

function newId() { return crypto.randomUUID(); }

function zoneId(pid: string | null) { return pid === null ? "zone:unassigned" : `zone:${pid}`; }

function parseDragId(id: string): { kind: "income" | "expense"; itemId: string } | null {
  const i = id.indexOf(":");
  if (i < 0) return null;
  const kind = id.slice(0, i);
  const itemId = id.slice(i + 1);
  return kind === "income" || kind === "expense" ? { kind, itemId } : null;
}

function DroppableZone({ personaId, title, subtitle, children }: {
  personaId: string | null; title: string; subtitle?: string; children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(personaId) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[80px] min-w-[200px] flex-1 flex-col rounded-lg border border-dashed p-2 transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-border bg-muted/20",
      )}
    >
      <div className="mb-1.5">
        <p className="text-xs font-medium">{title}</p>
        {subtitle ? <p className="text-[10px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DraggableShell({ dragId, children }: {
  dragId: string;
  children: (a: { setNodeRef: (n: HTMLElement | null) => void; style: CSSProperties | undefined; listeners: DraggableSyntheticListeners; attributes: DraggableAttributes }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: isDragging ? 50 : undefined }
    : undefined;
  return <>{children({ setNodeRef, style, listeners, attributes })}</>;
}

type Props = {
  personas: Persona[];
  onPersonasChange: (p: Persona[]) => void;
  streams: IncomeStream[];
  onStreamsChange: (s: IncomeStream[]) => void;
  expenses: ExpenseItem[];
  onExpensesChange: (e: ExpenseItem[]) => void;
  importedRecurringFromCsv?: boolean;
  personaSettings?: Map<string, PersonaSetting>;
};

export function HouseholdPersonasBoard({
  personas, onPersonasChange,
  streams, onStreamsChange,
  expenses, onExpensesChange,
  personaSettings,
}: Props) {
  const { t, numberLocale } = useI18n();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const raw = String(over.id);
    if (!raw.startsWith("zone:")) return;
    const tgt = raw.slice(5) === "unassigned" ? null : raw.slice(5);
    const parsed = parseDragId(String(active.id));
    if (!parsed) return;
    if (parsed.kind === "income") onStreamsChange(streams.map((s) => (s.id === parsed.itemId ? { ...s, personaId: tgt } : s)));
    else onExpensesChange(expenses.map((e) => (e.id === parsed.itemId ? { ...e, personaId: tgt } : e)));
  };

  const updateStream = (id: string, patch: Partial<IncomeStream>) => onStreamsChange(streams.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStream = (id: string) => onStreamsChange(streams.filter((s) => s.id !== id));
  const addStream = () => onStreamsChange([...streams, { id: newId(), label: t("household.incomeDefaultLabel"), preTaxMonthlySek: 0, workTimePercent: 100, personaId: null }]);
  const updateExpense = (id: string, patch: Partial<ExpenseItem>) => onExpensesChange(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExpense = (id: string) => onExpensesChange(expenses.filter((e) => e.id !== id));
  const addExpense = () => onExpensesChange([...expenses, { id: newId(), title: t("household.expenseDefaultTitle"), amountSek: 0, personaId: null }]);
  const updatePersonaName = (id: string, name: string) => onPersonasChange(personas.map((p) => (p.id === id ? { ...p, name } : p)));
  const updatePersonaWorkParams = (id: string, patch: Partial<PersonaWorkParams>) =>
    onPersonasChange(personas.map((p) => (p.id === id ? { ...p, workParams: { ...(p.workParams ?? DEFAULT_WORK_PARAMS), ...patch } } : p)));
  const addPersona = () => onPersonasChange([...personas, { id: newId(), name: t("household.newPerson"), type: "person", workParams: { ...DEFAULT_WORK_PARAMS } }]);
  const addCompany = () => onPersonasChange([...personas, { id: newId(), name: t("household.newCompany"), type: "company", workParams: { ...DEFAULT_WORK_PARAMS, workHoursPerWeek: 0 } }]);
  const removePersona = (id: string) => {
    onStreamsChange(streams.map((s) => (s.personaId === id ? { ...s, personaId: null } : s)));
    onExpensesChange(expenses.map((e) => (e.personaId === id ? { ...e, personaId: null } : e)));
    onPersonasChange(personas.filter((p) => p.id !== id));
  };

  const streamsInZone = (pid: string | null) => streams.filter((s) => s.personaId === pid);
  const expensesInZone = (pid: string | null) => expenses.filter((e) => e.personaId === pid);
  const netHintForPersona = (pid: string | null) => {
    const g = streams.filter((s) => s.personaId === pid).reduce((s, x) => s + effectiveMonthlyGross(x), 0);
    return { gross: g, net: stockholmTabellMonthlyNetFromMonthlyGrossCombined(g) };
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{t("household.personasTitle")}</CardTitle>
            <InfoTip text={t("household.personasTip")} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={addStream}>
              <Plus className="mr-0.5 h-3 w-3" /> {t("household.addIncome")}
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={addExpense}>
              <Plus className="mr-0.5 h-3 w-3" /> {t("household.addExpense")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addPersona}>
              <User className="mr-0.5 h-3 w-3" /> {t("household.addPerson")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCompany}>
              <Building2 className="mr-0.5 h-3 w-3" /> {t("household.addCompany")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <div className="flex flex-wrap gap-2">
              <DroppableZone personaId={null} title={t("household.unassigned")}>
                {streamsInZone(null).map((s) => <IncomeDraggable key={s.id} stream={s} onUpdate={updateStream} onRemove={removeStream} />)}
                {expensesInZone(null).map((e) => <ExpenseDraggable key={e.id} expense={e} onUpdate={updateExpense} onRemove={removeExpense} />)}
              </DroppableZone>
              {personas.map((p) => {
                const h = netHintForPersona(p.id);
                const isCompany = p.type === "company";
                const pSetting = personaSettings?.get(p.id);
                return (
                  <DroppableZone
                    key={p.id}
                    personaId={p.id}
                    title={p.name}
                    subtitle={t("household.groupSubtitle", { gross: fmt(h.gross), net: fmt(h.net) })}
                  >
                    <div className="mb-1 flex items-center gap-1">
                      {isCompany
                        ? <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <Input className="h-7 text-xs" value={p.name} onChange={(e) => updatePersonaName(p.id, e.target.value)} />
                      <Button type="button" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => removePersona(p.id)} aria-label={t("household.removePerson", { name: p.name })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <WorkParamsPanel
                      persona={p}
                      onUpdate={(patch) => updatePersonaWorkParams(p.id, patch)}
                      setting={pSetting}
                    />
                    {streamsInZone(p.id).map((s) => <IncomeDraggable key={s.id} stream={s} onUpdate={updateStream} onRemove={removeStream} />)}
                    {expensesInZone(p.id).map((e) => <ExpenseDraggable key={e.id} expense={e} onUpdate={updateExpense} onRemove={removeExpense} />)}
                  </DroppableZone>
                );
              })}
            </div>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Slider
        className="flex-1"
        min={min} max={max} step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="flex w-16 items-center gap-0.5">
        <Input
          className="h-5 w-12 px-1 text-[10px] tabular-nums"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        <span className="text-[9px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function BenefitLine({ label, amount, numberLocale }: { label: string; amount: number; numberLocale: string }) {
  if (amount <= 0) return null;
  return (
    <div className="flex justify-between text-[9px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-green-700 dark:text-green-400">
        {Math.round(amount).toLocaleString(numberLocale)} SEK
      </span>
    </div>
  );
}

function WorkParamsPanel({ persona, onUpdate, setting }: {
  persona: Persona;
  onUpdate: (patch: Partial<PersonaWorkParams>) => void;
  setting?: PersonaSetting;
}) {
  const { t, numberLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const wp = persona.workParams ?? DEFAULT_WORK_PARAMS;
  const isCompany = persona.type === "company";

  const sgi = setting?.sgiAnnual ?? 0;
  const ftGross = setting?.fullTimeGross ?? 0;
  const hasSgi = sgi > 0 || ftGross > 0;

  const breakdown: BenefitBreakdown | null = hasSgi
    ? computeBenefitBreakdown({
      sgiAnnual: sgi,
      fullTimeMonthlyGross: ftGross,
      workHoursPerWeek: wp.workHoursPerWeek,
      parentalLeavePercent: wp.parentalLeavePercent,
      akassaPercent: wp.akassaPercent,
      startaEgetPercent: wp.startaEgetPercent,
      daycareChildren: wp.daycareChildren,
    })
    : null;

  return (
    <div className="mb-1">
      <button
        type="button"
        className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t("workParams.toggle")}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded border border-border/50 bg-background/50 p-2">
          <SliderRow
            label={t("workParams.workHours")}
            value={wp.workHoursPerWeek} min={0} max={40} step={1} unit={t("workParams.hWeek")}
            onChange={(v) => onUpdate({ workHoursPerWeek: v })}
          />
          {!isCompany && (
            <SliderRow
              label={t("workParams.daycare")}
              value={wp.daycareChildren} min={0} max={5} step={1} unit={t("workParams.children")}
              onChange={(v) => onUpdate({ daycareChildren: v })}
            />
          )}
          {!isCompany && (
            <SliderRow
              label={t("workParams.parentalLeave")}
              value={wp.parentalLeavePercent} min={0} max={100} step={5} unit="%"
              onChange={(v) => onUpdate({ parentalLeavePercent: v })}
            />
          )}
          {!isCompany && (
            <SliderRow
              label={t("workParams.akassa")}
              value={wp.akassaPercent} min={0} max={100} step={5} unit="%"
              onChange={(v) => onUpdate({ akassaPercent: v })}
            />
          )}
          {isCompany && (
            <SliderRow
              label={t("workParams.startaEget")}
              value={wp.startaEgetPercent} min={0} max={100} step={5} unit="%"
              onChange={(v) => onUpdate({ startaEgetPercent: v })}
            />
          )}

          {breakdown && (
            <div className="mt-2 space-y-0.5 border-t border-border/30 pt-1.5">
              <p className="text-[9px] font-medium text-muted-foreground">{t("workParams.computed")}</p>
              <BenefitLine label={t("workParams.employment")} amount={breakdown.employmentGross} numberLocale={numberLocale} />
              <BenefitLine label={t("workParams.parentalLeave")} amount={breakdown.parentalLeaveGross} numberLocale={numberLocale} />
              <BenefitLine label={t("workParams.akassa")} amount={breakdown.akassaGross} numberLocale={numberLocale} />
              <BenefitLine label={t("workParams.startaEget")} amount={breakdown.startaEgetGross} numberLocale={numberLocale} />
              {breakdown.daycareCost > 0 && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-muted-foreground">{t("workParams.daycare")}</span>
                  <span className="tabular-nums font-medium text-red-600 dark:text-red-400">
                    -{Math.round(breakdown.daycareCost).toLocaleString(numberLocale)} SEK
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[10px] font-semibold border-t border-border/30 pt-0.5">
                <span>{t("workParams.totalGross")}</span>
                <span className="tabular-nums text-green-700 dark:text-green-400">
                  {Math.round(breakdown.totalGross).toLocaleString(numberLocale)} SEK
                </span>
              </div>
            </div>
          )}

          {!hasSgi && (
            <p className="mt-1 text-[9px] text-muted-foreground italic">{t("workParams.noSgi")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function IncomeDraggable({ stream, onUpdate, onRemove }: {
  stream: IncomeStream;
  onUpdate: (id: string, p: Partial<IncomeStream>) => void;
  onRemove: (id: string) => void;
}) {
  const { t, numberLocale } = useI18n();
  const gross = effectiveMonthlyGross(stream);
  return (
    <DraggableShell dragId={`income:${stream.id}`}>
      {({ setNodeRef, style, listeners, attributes }) => (
        <div ref={setNodeRef} style={style} className="rounded border-l-[3px] border border-green-400/60 bg-green-50/60 p-1.5 text-xs shadow-sm dark:border-green-600/40 dark:bg-green-950/30">
          <div className="flex items-center gap-1">
            <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={t("household.drag")} {...listeners} {...attributes}>
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                <Input className="h-7 min-w-[100px] flex-[2] text-xs" value={stream.label} onChange={(e) => onUpdate(stream.id, { label: e.target.value })} placeholder={t("household.label")} />
                <Input className="h-7 w-20 text-xs" inputMode="numeric" value={stream.preTaxMonthlySek || ""} onChange={(e) => onUpdate(stream.id, { preTaxMonthlySek: Number(e.target.value.replace(/\s/g, "")) || 0 })} placeholder={t("household.preTaxMonth")} />
                <Input className="h-7 w-16 text-xs" inputMode="numeric" value={stream.workTimePercent || ""} onChange={(e) => onUpdate(stream.id, { workTimePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} placeholder={t("household.workPercent")} />
              </div>
              <p className="mt-0.5 text-[10px] text-green-700 dark:text-green-400">
                {t("household.effectiveGross", { amount: Math.round(gross).toLocaleString(numberLocale), currency: t("common.currency") })}
              </p>
            </div>
            <Button type="button" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => onRemove(stream.id)} aria-label={t("household.removeIncome")}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </DraggableShell>
  );
}

function ExpenseDraggable({ expense, onUpdate, onRemove }: {
  expense: ExpenseItem;
  onUpdate: (id: string, p: Partial<ExpenseItem>) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <DraggableShell dragId={`expense:${expense.id}`}>
      {({ setNodeRef, style, listeners, attributes }) => (
        <div ref={setNodeRef} style={style} className="rounded border-l-[3px] border border-red-400/60 bg-red-50/60 p-1.5 text-xs shadow-sm dark:border-red-600/40 dark:bg-red-950/30">
          <div className="flex items-center gap-1">
            <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={t("household.drag")} {...listeners} {...attributes}>
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                <Input className="h-7 min-w-[100px] flex-[2] text-xs" value={expense.title} onChange={(e) => onUpdate(expense.id, { title: e.target.value })} placeholder={t("household.titlePlaceholder")} />
                <Input className="h-7 w-24 text-xs" inputMode="numeric" value={expense.amountSek || ""} onChange={(e) => onUpdate(expense.id, { amountSek: Number(e.target.value.replace(/\s/g, "")) || 0 })} placeholder={t("household.amountMonth")} />
              </div>
            </div>
            <Button type="button" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => onRemove(expense.id)} aria-label={t("household.removeExpense")}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </DraggableShell>
  );
}

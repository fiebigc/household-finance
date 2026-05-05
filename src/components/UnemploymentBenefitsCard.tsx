import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/BentoCard";
import { GaugeCard } from "@/components/GaugeCard";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import type { Entity } from "@/types/schema";
import type { BentoCardDefinition } from "@/components/BentoGrid";
import type {
  UnemploymentBenefitsMetadata,
  UnemploymentBenefitProgram,
  UnemploymentBenefitTier,
} from "@/types/unemploymentBenefits";
import {
  UNEMPLOYMENT_BENEFITS_META_KEY,
  aggregateBenefitGauge,
  getUnemploymentBenefitsForAdult,
  programQuotaDays,
} from "@/utils/unemploymentBenefits";
import { Umbrella, Plus, Trash2, X } from "lucide-react";

type BentoRender = Parameters<BentoCardDefinition["render"]>[0];

function cloneMeta(m: UnemploymentBenefitsMetadata): UnemploymentBenefitsMetadata {
  return JSON.parse(JSON.stringify(m)) as UnemploymentBenefitsMetadata;
}

export function UnemploymentBenefitsCard({ adult, p }: { adult: Entity; p: BentoRender }) {
  const household = useAppStore((s) => s.household);
  const refresh = useAppStore((s) => s.refresh);
  const backend = useBackend();
  const currency = household?.currency ?? "SEK";

  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<UnemploymentBenefitsMetadata>(() => cloneMeta(getUnemploymentBenefitsForAdult(adult)));

  useEffect(() => {
    if (editOpen) setDraft(cloneMeta(getUnemploymentBenefitsForAdult(adult)));
  }, [editOpen, adult]);

  const meta = useMemo(() => getUnemploymentBenefitsForAdult(adult), [adult]);
  const agg = useMemo(() => aggregateBenefitGauge(meta), [meta]);

  const save = async () => {
    setBusy(true);
    try {
      const normalized: UnemploymentBenefitsMetadata = {
        version: 1,
        programs: draft.programs.map((p0) => ({
          ...p0,
          tiers: p0.tiers
            .map((t, i) => ({
              ...t,
              order: i,
              duration_days: Math.max(0, Number(t.duration_days) || 0),
              compensation_per_day: Math.max(0, Number(t.compensation_per_day) || 0),
            }))
            .filter((t) => t.duration_days > 0),
        })),
      };
      await backend.upsertEntity({
        ...adult,
        metadata: {
          ...(adult.metadata && typeof adult.metadata === "object" ? adult.metadata : {}),
          [UNEMPLOYMENT_BENEFITS_META_KEY]: normalized,
        },
        updated_at: new Date().toISOString(),
      });
      await refresh();
      setEditOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const addProgram = () => {
    setDraft((d) => ({
      ...d,
      programs: [
        ...d.programs,
        {
          id: crypto.randomUUID(),
          name: "New benefit",
          source: "manual",
          imported_at: null,
          days_used: null,
          tiers: [
            {
              id: crypto.randomUUID(),
              order: 0,
              label: "Tier 1",
              duration_days: 300,
              compensation_per_day: 0,
            },
          ],
        },
      ],
    }));
  };

  const removeProgram = (pid: string) => {
    setDraft((d) => ({ ...d, programs: d.programs.filter((x) => x.id !== pid) }));
  };

  const updateProgram = (pid: string, patch: Partial<UnemploymentBenefitProgram>) => {
    setDraft((d) => ({
      ...d,
      programs: d.programs.map((x) => (x.id === pid ? { ...x, ...patch } : x)),
    }));
  };

  const addTier = (pid: string) => {
    setDraft((d) => ({
      ...d,
      programs: d.programs.map((x) => {
        if (x.id !== pid) return x;
        const tier: UnemploymentBenefitTier = {
          id: crypto.randomUUID(),
          order: x.tiers.length,
          label: `Tier ${x.tiers.length + 1}`,
          duration_days: 100,
          compensation_per_day: 0,
        };
        return { ...x, tiers: [...x.tiers, tier] };
      }),
    }));
  };

  const removeTier = (pid: string, tid: string) => {
    setDraft((d) => ({
      ...d,
      programs: d.programs.map((x) =>
        x.id === pid ? { ...x, tiers: x.tiers.filter((t) => t.id !== tid) } : x,
      ),
    }));
  };

  const updateTier = (pid: string, tid: string, patch: Partial<UnemploymentBenefitTier>) => {
    setDraft((d) => ({
      ...d,
      programs: d.programs.map((x) => {
        if (x.id !== pid) return x;
        return {
          ...x,
          tiers: x.tiers.map((t) => (t.id === tid ? { ...t, ...patch } : t)),
        };
      }),
    }));
  };

  const hasData = meta.programs.length > 0 && meta.programs.some((p0) => p0.tiers.length > 0);

  return (
    <>
      <Card
        title="Unemployment benefits"
        subtitle={adult.name}
        icon={<Umbrella className="w-4 h-4" />}
        onEdit={() => setEditOpen(true)}
        {...p}
      >
        <div className="space-y-3">
          {hasData ? (
            <>
              <GaugeCard
                available={Math.max(agg.quotaDays, 0)}
                used={agg.quotaDays <= 0 ? 0 : Math.min(agg.usedDays, agg.quotaDays)}
                unit="benefit days"
              />
              {agg.referenceRate != null && agg.remainingDays != null && agg.remainingDays > 0 && (
                <p className="text-[11px] text-muted-foreground text-center leading-snug">
                  ~{agg.referenceRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currency}/day avg · ~
                  {Math.round(agg.remainingDays * agg.referenceRate).toLocaleString("sv-SE")} {currency} left (gross,
                  indicative)
                </p>
              )}
              <div className="space-y-2 max-h-36 overflow-y-auto pr-0.5">
                {meta.programs.map((prog) => (
                  <div key={prog.id} className="rounded-lg bg-muted/35 px-2 py-1.5 text-[11px] leading-snug">
                    <div className="font-medium text-foreground truncate">{prog.name}</div>
                    {prog.notes ? (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{prog.notes}</p>
                    ) : null}
                    {prog.tiers.length === 0 ? (
                      <p className="text-muted-foreground">No tiers</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {prog.tiers.map((t) => (
                          <li key={t.id} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate">{t.label || `Tier ${t.order + 1}`}</span>
                            <span className="shrink-0">
                              {t.duration_days} d × {t.compensation_per_day.toLocaleString()} {currency}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {prog.days_used != null && (
                      <p className="mt-1 text-muted-foreground">
                        Used (this program): {prog.days_used} days · Quota {programQuotaDays(prog)} days
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              No benefit programs yet. Use Edit to add benefits and tiers (duration + compensation per day), or import
              from an a-kassa screenshot via the CLI.
            </p>
          )}
        </div>
      </Card>

      {editOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !busy && setEditOpen(false)}
          />
          <div
            className="relative w-full max-w-lg max-h-[88vh] overflow-hidden rounded-bento bg-card border border-border shadow-bento flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2 border-b border-border/50 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Unemployment benefits — {adult.name}</h2>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  Add one row per scheme (country-specific). Each scheme has ordered tiers: number of benefit days at that
                  compensation level. Amounts use household currency ({currency}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setEditOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {draft.programs.map((prog) => (
                <div key={prog.id} className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/20">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={prog.name}
                      onChange={(e) => updateProgram(prog.id, { name: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-background border border-border font-medium"
                      placeholder="Benefit name"
                    />
                    <button
                      type="button"
                      onClick={() => removeProgram(prog.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
                      title="Remove program"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    Days used (optional)
                    <input
                      type="number"
                      min={0}
                      value={prog.days_used ?? ""}
                      onChange={(e) =>
                        updateProgram(prog.id, {
                          days_used: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-24 px-2 py-0.5 rounded bg-background border border-border tabular-nums"
                    />
                  </label>

                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tiers</div>
                    {prog.tiers.map((tier) => (
                      <div key={tier.id} className="flex flex-wrap gap-2 items-center text-[11px]">
                        <input
                          value={tier.label ?? ""}
                          onChange={(e) => updateTier(prog.id, tier.id, { label: e.target.value })}
                          placeholder="Label"
                          className="flex-1 min-w-[80px] px-2 py-1 rounded bg-background border border-border"
                        />
                        <input
                          type="number"
                          min={0}
                          value={tier.duration_days}
                          onChange={(e) =>
                            updateTier(prog.id, tier.id, { duration_days: Number(e.target.value) })
                          }
                          className="w-20 px-2 py-1 rounded bg-background border border-border tabular-nums"
                          title="Days in tier"
                        />
                        <span className="text-muted-foreground">days ×</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={tier.compensation_per_day}
                          onChange={(e) =>
                            updateTier(prog.id, tier.id, { compensation_per_day: Number(e.target.value) })
                          }
                          className="w-24 px-2 py-1 rounded bg-background border border-border tabular-nums"
                        />
                        <span className="text-muted-foreground">{currency}/day</span>
                        <button
                          type="button"
                          onClick={() => removeTier(prog.id, tier.id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Remove tier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addTier(prog.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                    >
                      <Plus className="w-3 h-3" /> Add tier
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addProgram}
                className="inline-flex items-center gap-1.5 w-full justify-center py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/50"
              >
                <Plus className="w-4 h-4" /> Add benefit program
              </button>
            </div>

            <div className="flex justify-end gap-2 p-4 pt-2 border-t border-border/50 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

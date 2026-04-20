import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HouseholdConfig } from "../config/householdConfig";
import {
  cloneScenarioDefinition,
  createBlankScenario,
  newScenarioEntityId,
  type ScenarioDefinition,
  type ScenarioTile,
  type ScenarioTileCategory,
  type ScenarioTileSourceKind,
} from "../config/scenarios";
import type { RecurringCost } from "../data/bankData";
import { totalLoansMonthlyInterestCostSek } from "../utils/finance/loanMonthlyCost";
import { cn } from "@/lib/utils";

/** Bento-style saturated tiles (reference: design/bcdb901e566198ca3bdd3c7090e1d364.jpg). */
const SCENARIO_TILE_THEMES = [
  "bg-[#d1ff4d] text-gray-950 shadow-lg shadow-black/10 dark:bg-[#c4f045] dark:text-gray-950 dark:shadow-black/25",
  "bg-[#ff7a3d] text-gray-950 shadow-lg shadow-black/10 dark:bg-[#ff6d2d] dark:text-gray-950 dark:shadow-black/25",
  "bg-[#a394ff] text-gray-950 shadow-lg shadow-black/10 dark:bg-[#9585ff] dark:text-gray-950 dark:shadow-black/25",
  "bg-[#ffef8a] text-gray-950 shadow-lg shadow-black/10 dark:bg-[#ffe97a] dark:text-gray-950 dark:shadow-black/20",
  "bg-[#a0c4ff] text-gray-950 shadow-lg shadow-black/10 dark:bg-[#8eb8ff] dark:text-gray-950 dark:shadow-black/25",
] as const;

const SCENARIO_TILE_FIELD =
  "!border-0 bg-white/55 text-gray-950 shadow-sm ring-0 placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-black/20 dark:bg-black/10 dark:text-gray-950 dark:placeholder:text-gray-700 dark:focus-visible:ring-white/30";

export type ScenarioBuilderPanelProps = {
  scenarioLibrary: ScenarioDefinition[];
  setScenarioLibrary: Dispatch<SetStateAction<ScenarioDefinition[]>>;
  selectedScenarioId: string;
  setSelectedScenarioId: (id: string) => void;
  householdDraft: HouseholdConfig;
  recurringCosts: RecurringCost[];
  formatSek: (value: number) => string;
};

function updateScenario(
  list: ScenarioDefinition[],
  id: string,
  fn: (s: ScenarioDefinition) => ScenarioDefinition,
): ScenarioDefinition[] {
  return list.map((s) => (s.id === id ? fn(s) : s));
}

export function ScenarioBuilderPanel({
  scenarioLibrary,
  setScenarioLibrary,
  selectedScenarioId,
  setSelectedScenarioId,
  householdDraft,
  recurringCosts,
  formatSek,
}: ScenarioBuilderPanelProps) {
  const active = scenarioLibrary.find((s) => s.id === selectedScenarioId) ?? scenarioLibrary[0];

  const patchActive = useCallback(
    (fn: (s: ScenarioDefinition) => ScenarioDefinition) => {
      if (!active) return;
      setScenarioLibrary((prev) => updateScenario(prev, active.id, fn));
    },
    [active, setScenarioLibrary],
  );

  const addScenario = () => {
    const next = createBlankScenario({ name: "New scenario", household: householdDraft });
    setScenarioLibrary((prev) => [...prev, next]);
    setSelectedScenarioId(next.id);
  };

  const duplicateActiveScenario = () => {
    if (!active) return;
    const next = cloneScenarioDefinition(active);
    setScenarioLibrary((prev) => [...prev, next]);
    setSelectedScenarioId(next.id);
  };

  const removeActiveScenario = () => {
    if (!active || scenarioLibrary.length <= 1) return;
    setScenarioLibrary((prev) => prev.filter((s) => s.id !== active.id));
    const rest = scenarioLibrary.filter((s) => s.id !== active.id);
    setSelectedScenarioId(rest[0]?.id ?? "");
  };

  const addTile = () => {
    if (!active) return;
    const tile: ScenarioTile = {
      id: newScenarioEntityId("tile"),
      name: "New tile",
      category: "custom",
      validFrom: active.startDate.slice(0, 10),
      validTo: null,
      sourceKind: "none",
      sourceRef: null,
      customMonthlyAmountSek: null,
    };
    patchActive((s) => ({ ...s, tiles: [...s.tiles, tile] }));
  };

  const duplicateTile = (tileId: string) => {
    if (!active) return;
    const t = active.tiles.find((x) => x.id === tileId);
    if (!t) return;
    const copy: ScenarioTile = {
      ...t,
      id: newScenarioEntityId("tile"),
      name: `${t.name} (copy)`,
    };
    patchActive((s) => ({ ...s, tiles: [...s.tiles, copy] }));
  };

  const removeTile = (tileId: string) => {
    patchActive((s) => ({ ...s, tiles: s.tiles.filter((t) => t.id !== tileId) }));
  };

  const updateTile = (tileId: string, patch: Partial<ScenarioTile>) => {
    patchActive((s) => ({
      ...s,
      tiles: s.tiles.map((t) => (t.id === tileId ? { ...t, ...patch } : t)),
    }));
  };

  const loanInterestPreview = totalLoansMonthlyInterestCostSek(householdDraft.loans);

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a scenario to start building.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {scenarioLibrary.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant={s.id === active.id ? "default" : "outline"}
            className="max-w-[11rem] shrink-0 truncate"
            title={s.name}
            onClick={() => setSelectedScenarioId(s.id)}
          >
            {s.name}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={addScenario}>
          <Plus className="mr-1 size-3.5" aria-hidden />
          New scenario
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={duplicateActiveScenario}>
          <Copy className="mr-1 size-3.5" aria-hidden />
          Duplicate scenario
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-finance-expense"
          disabled={scenarioLibrary.length <= 1}
          onClick={removeActiveScenario}
        >
          <Trash2 className="mr-1 size-3.5" aria-hidden />
          Delete scenario
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="scenario-name">Scenario name</Label>
          <Input
            id="scenario-name"
            value={active.name}
            onChange={(e) =>
              patchActive((s) => ({ ...s, name: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scenario-start">Projection start</Label>
          <Input
            id="scenario-start"
            type="date"
            value={active.startDate.slice(0, 10)}
            onChange={(e) =>
              patchActive((s) => ({ ...s, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scenario-end">Projection end</Label>
          <Input
            id="scenario-end"
            type="date"
            value={active.endDate.slice(0, 10)}
            onChange={(e) =>
              patchActive((s) => ({ ...s, endDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="scenario-desc">Description</Label>
          <Textarea
            id="scenario-desc"
            rows={2}
            className="min-h-[4rem] resize-y text-sm"
            value={active.description}
            onChange={(e) =>
              patchActive((s) => ({ ...s, description: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
        <p className="text-xs font-semibold text-foreground">Scenario tiles</p>
        <Button type="button" size="sm" variant="secondary" onClick={addTile}>
          <Plus className="mr-1 size-3.5" aria-hidden />
          Add tile
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tiles document what this scenario assumes. Link a tile to Current Finances (loan interest
        total, recurring net, or one recurring row). Time ranges are inclusive from / to dates; leave
        end empty for open-ended. Engine projections still follow scenario events below (add events
        in data tooling or future UI when you need automated month changes).
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.tiles.map((tile, tileIndex) => (
          <li
            key={tile.id}
            className={cn(
              "space-y-2 rounded-2xl p-3 backdrop-blur-[2px]",
              SCENARIO_TILE_THEMES[tileIndex % SCENARIO_TILE_THEMES.length],
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">Tile name</Label>
                  <Input
                    className={cn("h-9 text-sm", SCENARIO_TILE_FIELD)}
                    value={tile.name}
                    onChange={(e) => updateTile(tile.id, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">Category</Label>
                  <select
                    className={cn("native-select mt-0 h-9 text-sm", SCENARIO_TILE_FIELD)}
                    value={tile.category}
                    onChange={(e) =>
                      updateTile(tile.id, {
                        category: e.target.value as ScenarioTileCategory,
                      })
                    }
                  >
                    <option value="income">Income</option>
                    <option value="cost">Costs</option>
                    <option value="loan">Loan</option>
                    <option value="children">Children</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">Valid from</Label>
                  <Input
                    type="date"
                    className={cn("h-9 text-sm", SCENARIO_TILE_FIELD)}
                    value={tile.validFrom.slice(0, 10)}
                    onChange={(e) => updateTile(tile.id, { validFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">
                    Valid to (optional)
                  </Label>
                  <Input
                    type="date"
                    className={cn("h-9 text-sm", SCENARIO_TILE_FIELD)}
                    value={tile.validTo?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      updateTile(tile.id, {
                        validTo: e.target.value.trim() === "" ? null : e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">
                    Linked value (Current Finances)
                  </Label>
                  <select
                    className={cn("native-select mt-0 h-9 text-sm", SCENARIO_TILE_FIELD)}
                    value={tile.sourceKind}
                    onChange={(e) => {
                      const sourceKind = e.target.value as ScenarioTileSourceKind;
                      updateTile(tile.id, {
                        sourceKind,
                        sourceRef: sourceKind === "recurring_row" ? tile.sourceRef : null,
                        customMonthlyAmountSek:
                          sourceKind === "custom_monthly"
                            ? (tile.customMonthlyAmountSek ?? 0)
                            : null,
                      });
                    }}
                  >
                    <option value="none">None (narrative only)</option>
                    <option value="loan_interest_monthly">
                      Total loan interest / month ({formatSek(loanInterestPreview)})
                    </option>
                    <option value="recurring_net">Recurring list net / month</option>
                    <option value="recurring_row">Single recurring row</option>
                    <option value="custom_monthly">Custom amount (SEK / month)</option>
                  </select>
                </div>
                {tile.sourceKind === "custom_monthly" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">
                      Custom monthly amount (SEK)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      className={cn("h-9 text-sm", SCENARIO_TILE_FIELD)}
                      inputMode="numeric"
                      value={tile.customMonthlyAmountSek ?? 0}
                      onChange={(e) => {
                        const n = Number(e.target.value || 0);
                        updateTile(tile.id, {
                          customMonthlyAmountSek: Number.isFinite(n) ? Math.max(0, n) : 0,
                        });
                      }}
                    />
                    <p className="text-[10px] leading-snug text-gray-900/70 dark:text-gray-950/80">
                      Saved with this scenario in Supabase. Use category above for cost vs income
                      semantics in summaries.
                    </p>
                  </div>
                ) : null}
                {tile.sourceKind === "recurring_row" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] text-gray-900/85 dark:text-gray-950/90">
                      Recurring row
                    </Label>
                    <select
                      className={cn("native-select mt-0 h-9 text-sm", SCENARIO_TILE_FIELD)}
                      value={tile.sourceRef ?? ""}
                      onChange={(e) =>
                        updateTile(tile.id, {
                          sourceRef: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Select a row…</option>
                      {recurringCosts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} · {c.kind === "income" ? "+" : "−"}
                          {formatSek(c.amountSek)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-0 bg-white/60 px-2 text-gray-900 shadow-sm hover:bg-white/90 dark:bg-black/15 dark:text-gray-950 dark:hover:bg-black/25"
                  title="Duplicate tile"
                  onClick={() => duplicateTile(tile.id)}
                >
                  <Copy className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-gray-900/70 hover:bg-black/10 hover:text-gray-950 dark:text-gray-950/80 dark:hover:bg-black/20 dark:hover:text-red-700"
                  title="Remove tile"
                  onClick={() => removeTile(tile.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

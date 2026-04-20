import { type Dispatch, type SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BentoCardSurfaceTheme } from "@/config/bentoCardSurfaces";
import type { EntityRecord } from "@/data/bankData";
import { pensionBracketLabelToEn } from "@/utils/finance/pensionPortalDisplay";
import type { PersonPensionPortalSlice, PlanningPortalReference } from "@/utils/finance/planningPortalSnapshot";
import { patchPensionColumnMeta } from "@/utils/finance/planningPortalSnapshot";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

function stripEntityTypeSuffix(label: string): string {
  return label.replace(/\s*·\s*(adult|child|company|shared)\s*$/i, "").trim();
}

function pensionColumnDisplayName(
  col: { displayLabel: string; ownerAccountRef?: string | null },
  entities: readonly EntityRecord[],
): string {
  const linked = col.ownerAccountRef
    ? entities.find((e) => e.id === col.ownerAccountRef)
    : undefined;
  if (linked) return linked.name;
  return stripEntityTypeSuffix(col.displayLabel);
}

type Props = {
  bentoSurface: BentoCardSurfaceTheme;
  snapshot: PlanningPortalReference | null;
  formatSek: (n: number) => string;
  entities: readonly EntityRecord[];
  setPortalSnapshot: Dispatch<SetStateAction<PlanningPortalReference | null>>;
};

function PensionColumnPanel({ col, formatSek }: { col: PersonPensionPortalSlice; formatSek: (n: number) => string }) {
  const { pensionFrom65, premiepension } = col;
  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-[10px] border border-border/60 bg-card/80 p-3 shadow-sm">
        <p
          className="text-xs font-semibold text-foreground"
          title={`Reference salary today: ${formatSek(pensionFrom65.salaryTodaySek)}.`}
        >
          {pensionFrom65.title}
        </p>
        <div className="mt-2 space-y-1">
          {pensionFrom65.brackets.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/60 px-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{pensionBracketLabelToEn(row.label)}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {formatSek(row.sekPerMonth)}/mo before tax
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-border/60 bg-card/80 p-3 shadow-sm">
        <p className="text-xs font-semibold text-[hsl(24_95%_40%)]" title={premiepension.blurb}>
          {premiepension.title}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border/50 bg-muted/20 p-2 md:col-span-2">
            <p className="text-xs text-muted-foreground">Total value</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {formatSek(premiepension.totalValueSek)}
            </p>
          </div>
          <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="min-w-0 shrink text-muted-foreground">Value change YTD</span>
              <span className="shrink-0 font-medium text-finance-income tabular-nums">
                +{premiepension.valueChangeYtdPct}%
              </span>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="min-w-0 shrink text-muted-foreground">Avg. per year since start</span>
              <span className="shrink-0 font-medium tabular-nums">+{premiepension.avgAnnualSinceStartPct}%</span>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="min-w-0 shrink text-muted-foreground">Portfolio fee</span>
              <span className="shrink-0 font-medium tabular-nums">{premiepension.portfolioFeePct}%</span>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <span className="min-w-0 shrink text-muted-foreground">Average customer fee</span>
              <span className="shrink-0 font-medium tabular-nums">{premiepension.avgCustomerFeePct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlanningPortalPensionCard({
  bentoSurface,
  snapshot,
  formatSek,
  entities,
  setPortalSnapshot,
}: Props) {
  const columnGrid =
    snapshot && snapshot.pensionColumns.length > 1 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4";

  const updateColumn = (index: number, patch: { displayLabel?: string; ownerAccountRef?: string | null }) => {
    setPortalSnapshot((prev) => {
      if (!prev) return prev;
      return patchPensionColumnMeta(prev, index, patch);
    });
  };

  return (
    <Card bentoSurface={bentoSurface} className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle title="Forecast and premium pension (reference from portal_snapshot — minpension / Pensionsmyndigheten).">
          Pension
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!snapshot ? (
          <div className="rounded-[10px] border border-dashed border-border/70 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No pension reference in the database yet. Use the same JSON source as the FK card (
            <span className="font-mono text-foreground/80">portal_snapshot</span>
            ). Add a <span className="font-mono text-foreground/80">pensionColumns</span> array for one row per
            household member; optional <span className="font-mono text-foreground/80">ownerAccountRef</span> ties a
            column to your auth/profile id (set values in Supabase, not in code).
          </div>
        ) : (
          <div className={cn(columnGrid)}>
            {snapshot.pensionColumns.map((col, i) => {
              const headline = pensionColumnDisplayName(col, entities);
              return (
                <section
                  key={`${col.displayLabel}-${i}`}
                  className="group/pension-col relative min-w-0 space-y-2"
                >
                  <div className="flex flex-col gap-2 border-b border-border/40 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`pension-col-label-${i}`} className="sr-only">
                        Column name
                      </Label>
                      {col.ownerAccountRef ? (
                        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                          {headline}
                        </p>
                      ) : (
                        <Input
                          id={`pension-col-label-${i}`}
                          className="h-9 border-0 bg-transparent px-0 text-sm font-semibold tracking-tight shadow-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                          value={col.displayLabel}
                          onChange={(e) => updateColumn(i, { displayLabel: e.target.value })}
                          autoComplete="off"
                          placeholder="Name"
                        />
                      )}
                    </div>
                    <div className="relative min-h-9 w-full shrink-0 sm:ms-auto sm:w-[min(100%,14rem)]">
                      <Label htmlFor={`pension-col-entity-${i}`} className="sr-only">
                        Link household entity
                      </Label>
                      <div
                        className="pointer-events-none absolute inset-0 z-0 hidden items-center justify-end gap-1.5 rounded-lg border border-dashed border-border/55 bg-muted/15 px-3 text-xs text-muted-foreground sm:flex sm:group-hover/pension-col:opacity-0 sm:group-focus-within/pension-col:opacity-0"
                        aria-hidden
                      >
                        <span>Entity</span>
                        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                      </div>
                      <select
                        id={`pension-col-entity-${i}`}
                        className={cn(
                          "native-select relative z-10 mt-0 h-9 w-full text-sm sm:rounded-lg sm:border sm:border-border/70 sm:bg-card sm:shadow-md sm:ring-1 sm:ring-black/[0.04] dark:sm:ring-white/[0.06]",
                          "sm:absolute sm:inset-0 sm:mt-0 sm:transition-[opacity,box-shadow]",
                          "sm:opacity-0 sm:backdrop-blur-sm sm:pointer-events-none",
                          "sm:group-hover/pension-col:pointer-events-auto sm:group-hover/pension-col:opacity-100",
                          "sm:group-focus-within/pension-col:pointer-events-auto sm:group-focus-within/pension-col:opacity-100",
                          "sm:focus:pointer-events-auto sm:focus:opacity-100",
                        )}
                        value={col.ownerAccountRef ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          const ent = entities.find((x) => x.id === id);
                          updateColumn(i, {
                            ownerAccountRef: id === "" ? null : id,
                            displayLabel: ent ? ent.name : col.displayLabel,
                          });
                        }}
                        title="Hover or focus this row, then pick a household entity"
                      >
                        <option value="">None</option>
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>
                            {ent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <PensionColumnPanel col={col} formatSek={formatSek} />
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

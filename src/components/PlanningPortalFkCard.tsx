import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BentoCardSurfaceTheme } from "@/config/bentoCardSurfaces";
import type { HouseholdConfig } from "@/config/householdConfig";
import type { FkChildDaysSnapshot, PlanningPortalReference } from "@/utils/finance/planningPortalSnapshot";
import { cn } from "@/lib/utils";
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

/**
 * FK JSON keeps legacy keys `unto` / `aaro`; align headings with household children when possible:
 * `unto` → second child, `aaro` → first child (matches shipped sample ordering).
 */
function fkSnapshotChildHeading(
  slot: "unto" | "aaro",
  snap: FkChildDaysSnapshot,
  household: HouseholdConfig | undefined,
): string {
  if (!household?.children?.length) return snap.childLabel;
  const c0 = household.children[0];
  const c1 = household.children[1];
  if (slot === "unto") return (c1 ?? c0)?.label?.trim() || snap.childLabel;
  return c0?.label?.trim() || snap.childLabel;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

function safeNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function FkDaysRadial({ snap }: { snap: FkChildDaysSnapshot }) {
  const fatherSgi = safeNonNegative(snap.sjukpenningnivaDu);
  const fatherMin = safeNonNegative(snap.lagstaDu);
  const motherSgi = safeNonNegative(snap.sjukpenningnivaPartner);
  const motherMin = safeNonNegative(snap.lagstaPartner);
  const fatherTotal = fatherSgi + fatherMin;
  const motherTotal = motherSgi + motherMin;
  const total = fatherTotal + motherTotal;
  const chartData = [
    {
      fatherSgi,
      fatherMin,
      motherSgi,
      motherMin,
    },
  ];
  return (
    <div className="mt-2 rounded-md border border-border/50 bg-muted/15 p-2">
      <div className="h-[170px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={chartData}
            cx="50%"
            cy="72%"
            innerRadius="45%"
            outerRadius="74%"
            startAngle={180}
            endAngle={0}
          >
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 8} className="fill-foreground text-sm font-semibold">
                        {formatNum(total)}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 8} className="fill-muted-foreground text-[10px]">
                        days left
                      </tspan>
                    </text>
                  );
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="fatherSgi"
              stackId="a"
              fill="#2563eb"
              cornerRadius={4}
              isAnimationActive={false}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="fatherMin"
              stackId="a"
              fill="#60a5fa"
              cornerRadius={4}
              isAnimationActive={false}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="motherSgi"
              stackId="a"
              fill="#be123c"
              cornerRadius={4}
              isAnimationActive={false}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="motherMin"
              stackId="a"
              fill="#fb7185"
              cornerRadius={4}
              isAnimationActive={false}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
        <p className="rounded border border-border/40 bg-background/60 px-2 py-1 text-center">
          <span className="text-muted-foreground">Father</span>{" "}
          <span className="font-medium tabular-nums text-foreground">{formatNum(fatherTotal)}</span>
        </p>
        <p className="rounded border border-border/40 bg-background/60 px-2 py-1 text-center">
          <span className="text-muted-foreground">Mother</span>{" "}
          <span className="font-medium tabular-nums text-foreground">{formatNum(motherTotal)}</span>
        </p>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
        <p className="rounded border border-border/30 bg-background/50 px-2 py-1 text-center">
          Father: SGI {formatNum(fatherSgi)} + Min {formatNum(fatherMin)}
        </p>
        <p className="rounded border border-border/30 bg-background/50 px-2 py-1 text-center">
          Mother: SGI {formatNum(motherSgi)} + Min {formatNum(motherMin)}
        </p>
      </div>
    </div>
  );
}

function FkChildCard({
  snap,
  accentClass,
  heading,
}: {
  snap: FkChildDaysSnapshot;
  accentClass: string;
  heading: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border/60 bg-card/80 p-3 shadow-sm",
        "ring-1 ring-inset ring-black/[0.03]",
      )}
    >
      <p className={cn("text-xs font-semibold", accentClass)} title={snap.childLabel !== heading ? `FK portal: ${snap.childLabel}` : undefined}>
        {heading}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{formatNum(snap.totalRemaining)}</span> of{" "}
        {snap.totalCap} days remaining in total
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Father {formatNum(snap.duRemaining)} · Mother {formatNum(snap.partnerRemaining)}
      </p>
      <FkDaysRadial snap={snap} />
      <div className="mt-2 overflow-hidden rounded-md border border-border/50 text-xs">
        <div className="grid grid-cols-3 bg-muted/40 px-1.5 py-1 font-medium text-muted-foreground">
          <span>Level</span>
          <span className="text-center">Father</span>
          <span className="text-center">Mother</span>
        </div>
        <div className="grid grid-cols-3 border-t border-border/40 px-1.5 py-1">
          <span className="text-muted-foreground">Sickness benefit level</span>
          <span className="text-center tabular-nums">{formatNum(snap.sjukpenningnivaDu)}</span>
          <span className="text-center tabular-nums">{formatNum(snap.sjukpenningnivaPartner)}</span>
        </div>
        <div className="grid grid-cols-3 border-t border-border/40 px-1.5 py-1">
          <span className="text-muted-foreground">Minimum level</span>
          <span className="text-center tabular-nums">{formatNum(snap.lagstaDu)}</span>
          <span className="text-center tabular-nums">{formatNum(snap.lagstaPartner)}</span>
        </div>
      </div>
      {snap.dubbeldagarMax != null ? (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Double days: you may use up to{" "}
          <span className="font-medium text-foreground">{snap.dubbeldagarMax}</span> days at the same time as the
          other parent (per FK reference view).
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  bentoSurface: BentoCardSurfaceTheme;
  snapshot: PlanningPortalReference | null;
  householdConfig?: HouseholdConfig;
};

export function PlanningPortalFkCard({ bentoSurface, snapshot, householdConfig }: Props) {
  const fkTitleTip = [
    "Parental benefit — days left per child (reference from portal_snapshot).",
    snapshot?.sourceNote,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card bentoSurface={bentoSurface} className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle title={fkTitleTip}>
          Swedish Social Insurance · FK
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!snapshot ? (
          <div className="rounded-[10px] border border-dashed border-border/70 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No FK reference in the database. Fill <span className="font-mono text-foreground/80">portal_snapshot</span>{" "}
            (JSON) via migration or the Supabase SQL editor.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <FkChildCard
                snap={snapshot.unto}
                accentClass="text-finance-income"
                heading={fkSnapshotChildHeading("unto", snapshot.unto, householdConfig)}
              />
              <FkChildCard
                snap={snapshot.aaro}
                accentClass="text-finance-income"
                heading={fkSnapshotChildHeading("aaro", snapshot.aaro, householdConfig)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

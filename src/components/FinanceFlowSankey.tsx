import { useMemo, useState } from "react";
import { Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import {
  toRechartsSankeyData,
  type FinanceSankeyNodeZone,
  type SankeySyntheticIncome,
} from "@/utils/financeFlowSankeyLayout";
import type { Account, Cashflow } from "@/types/schema";
import { formatSEK, cn } from "@/lib/utils";
import { Map as MapIcon } from "lucide-react";

interface FinanceFlowSankeyProps {
  cashflows: Cashflow[];
  accounts: Account[];
  /** Modeled FK parental benefit net (projection). */
  syntheticIncomes?: SankeySyntheticIncome[];
  /** Net-ish monthly SEK per income cashflow for bands (calendar FTE × tax vs stored gross). */
  getIncomeFlowAmount?: (cf: Cashflow) => number;
  /** Month used to convert expense frequencies to monthly equivalents (Planning rules). */
  referenceMonth?: Date;
  className?: string;
}

function SankeyTooltipContent({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const name: string | undefined = entry?.name;
  const value: number | undefined = entry?.value;
  const inner = entry?.payload;

  // Link tooltip (has source + target on the inner payload)
  if (inner?.source != null && inner?.target != null) {
    const srcName = inner.source?.name ?? "Source";
    const tgtName = inner.target?.name ?? "Target";
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-0.5">
        <p className="text-card-foreground">
          <span className="font-medium">{srcName}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="font-medium">{tgtName}</span>
        </p>
        {value != null && (
          <p className="text-muted-foreground tabular-nums">{formatSEK(value)}</p>
        )}
      </div>
    );
  }

  // Node tooltip
  if (name) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
        <p className="font-medium text-card-foreground">{name}</p>
        {value != null && (
          <p className="text-muted-foreground tabular-nums">{formatSEK(value)}</p>
        )}
      </div>
    );
  }

  return null;
}

const ZONE_FILL: Record<FinanceSankeyNodeZone, string> = {
  income: "hsl(145 62% 44%)",
  personal: "hsl(217 75% 60%)",
  shared: "hsl(217 75% 48%)",
  expense: "hsl(356 74% 56%)",
  surplus: "hsl(48 92% 54%)",
};

const ZONE_STROKE: Record<FinanceSankeyNodeZone, string> = {
  income: "hsl(145 50% 32%)",
  personal: "hsl(217 60% 45%)",
  shared: "hsl(217 60% 35%)",
  expense: "hsl(356 60% 40%)",
  surplus: "hsl(42 76% 38%)",
};

interface SankeyNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: { nodeZone?: FinanceSankeyNodeZone; name?: string; value?: number };
}

function FinanceFlowSankeyNode(props: SankeyNodeProps & Record<string, unknown>) {
  const { x = 0, y = 0, width = 14, height = 0, payload } = props;
  const z = payload?.nodeZone ?? "personal";
  const name = payload?.name ?? "";
  const value = payload?.value ?? 0;

  const labelRight = z === "income" || z === "personal";
  const labelX = labelRight ? x + width + 5 : x - 5;
  const textAnchor = labelRight ? "start" : "end";

  const tipText = value > 0 ? `${name}: ${formatSEK(value)}` : name;

  return (
    <g>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={ZONE_FILL[z]}
        stroke={ZONE_STROKE[z]}
        strokeWidth={1}
        fillOpacity={0.9}
        className="recharts-sankey-node"
        role="img"
      >
        <title>{tipText}</title>
      </Rectangle>
      {name && height > 6 && (
        <text
          x={labelX}
          y={y + height / 2}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={10}
          fill="currentColor"
          className="fill-foreground"
          style={{ cursor: "default" }}
        >
          {name}
          <title>{tipText}</title>
        </text>
      )}
    </g>
  );
}

interface SankeyLinkProps {
  sourceX?: number;
  sourceY?: number;
  sourceControlX?: number;
  targetX?: number;
  targetY?: number;
  targetControlX?: number;
  linkWidth?: number;
  index?: number;
  payload?: {
    source?: { nodeZone?: FinanceSankeyNodeZone };
    target?: { nodeZone?: FinanceSankeyNodeZone };
  };
}

function FinanceFlowSankeyLink(props: SankeyLinkProps) {
  const {
    sourceX = 0,
    sourceY = 0,
    sourceControlX = 0,
    targetX = 0,
    targetY = 0,
    targetControlX = 0,
    linkWidth = 1,
    index = 0,
    payload,
  } = props;

  const srcZone: FinanceSankeyNodeZone = payload?.source?.nodeZone ?? "personal";
  const tgtZone: FinanceSankeyNodeZone = payload?.target?.nodeZone ?? "personal";
  const gradId = `ff-link-grad-${index}`;

  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={ZONE_FILL[srcZone]} />
          <stop offset="100%" stopColor={ZONE_FILL[tgtZone]} />
        </linearGradient>
      </defs>
      <path
        className="recharts-sankey-link"
        d={d}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={linkWidth}
        strokeOpacity={0.5}
      />
      {/* Invisible wider hit-area so the tooltip triggers on hover */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(linkWidth, 8)}
        style={{ pointerEvents: "stroke" }}
      />
    </>
  );
}

export function FinanceFlowSankeyDiagram({
  cashflows,
  accounts,
  syntheticIncomes,
  getIncomeFlowAmount,
  referenceMonth,
  className,
}: FinanceFlowSankeyProps) {
  const data = useMemo(
    () =>
      toRechartsSankeyData(cashflows, accounts, syntheticIncomes, getIncomeFlowAmount, referenceMonth),
    [cashflows, accounts, syntheticIncomes, getIncomeFlowAmount, referenceMonth],
  );

  const syntheticRoutingRemountKey = useMemo(
    () =>
      (syntheticIncomes ?? [])
        .map(
          (x) =>
            `${x.entityId}:${x.monthlyNet}:${x.from_account_id ?? ""}:${x.to_account_id ?? ""}`,
        )
        .join("|"),
    [syntheticIncomes],
  );

  if (!data) {
    return (
      <div className={cn("w-full", className)}>
        <p className="text-xs text-muted-foreground text-center py-8">
          No cashflows to visualize. Add income and expense budget lines in the Cashflows card.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={380} key={syntheticRoutingRemountKey}>
        <Sankey
          data={data}
          nodeWidth={12}
          nodePadding={14}
          linkCurvature={0.5}
          iterations={64}
          margin={{ top: 12, right: 120, bottom: 12, left: 120 }}
          link={FinanceFlowSankeyLink}
          node={<FinanceFlowSankeyNode />}
        >
          <Tooltip content={<SankeyTooltipContent />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

interface LegendBtnProps {
  className?: string;
}

export function FinanceFlowSankeyLegendButton({ className }: LegendBtnProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-muted/80 hover:text-card-foreground"
        aria-expanded={open}
        title="How to read this chart"
      >
        <MapIcon className="w-3.5 h-3.5" />
        Legend
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-[62]" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-[63] w-[min(calc(100vw-3rem),20rem)] rounded-lg border border-border bg-card shadow-lg p-3 text-[11px] space-y-2 text-muted-foreground">
            <p className="font-medium text-card-foreground">Finance Flow Sankey</p>
            <p>
              Money flows left to right: income from outside the household → personal accounts
              for each adult → shared/common accounts → expenses leaving the household.
            </p>
            <p>
              <span className="text-card-foreground">Band width</span> is proportional to SEK amount.
              Hover any node or link to see the exact figure.
            </p>
            <p>
              <span className="text-green-600">Green</span> = income sources,{" "}
              <span className="text-blue-500">Blue</span> = accounts (lighter = personal, darker = shared),{" "}
              <span className="text-red-500">Red</span> = expenses,{" "}
              <span className="text-yellow-600">Yellow</span> = household surplus (unspent).
              Links transition from source colour to target colour.
            </p>
            <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
              Between personal and shared wallets, bands are split by each salary line’s tagged person (cashflow entity),
              then by which account receives that income—not by who deposited more globally. Bands share one scale per column.
              Household surplus / External gap fill reconcile budget totals when income and modelled spends differ.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

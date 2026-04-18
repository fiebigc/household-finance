import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardInsightsResult } from "@/utils/finance/dashboardInsights";

interface Props {
  insights: DashboardInsightsResult;
  formatSek: (n: number) => string;
  /** Recurring net (out − in) from the editable recurring list, SEK/month. */
  recurringNetCashAdjustSek: number;
}

const BAROMETER_HELP =
  "Based on modeled monthly income, household costs in the engine, and your recurring list. Not tax advice.";

const PAIN_POINTS_HELP =
  "Rule-based flags for large recurring lines, leverage, and scenario stress.";

const SNAPSHOT_HELP =
  "Modeled income, surplus after recurring items, rough liquidity runway.";

const MODELED_FLOW_HELP =
  "Baseline month from the engine vs your recurring list (out − in). Same modeled month as the snapshot income line.";

function headlineWithTooltip(title: string, tooltip: string) {
  return (
    <CardTitle
      className="w-fit cursor-help border-b border-dotted border-muted-foreground/55 text-base leading-tight"
      title={tooltip}
    >
      {title}
    </CardTitle>
  );
}

export function HouseholdBarometerCard({ insights, formatSek }: Props) {
  const { baselineMonth, healthScore, healthLabel } = insights;
  const pct = Math.min(100, Math.max(0, healthScore));
  const barometerTooltip = `${BAROMETER_HELP} Current modeled income: ${formatSek(baselineMonth.totalIncomeSek)}.`;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2 pt-4">
        {headlineWithTooltip("Household barometer", barometerTooltip)}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3 pb-4">
        <div
          className="health-meter-track"
          style={{ ["--health-pct" as string]: `${pct}%` }}
          role="img"
          aria-valuenow={healthScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Financial health ${healthScore} out of 100`}
        >
          <span className="health-meter-thumb" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="kpi-tile-value text-2xl tabular-nums text-foreground">
            {healthScore}
            <span className="text-base font-normal text-muted-foreground"> / 100</span>
          </p>
          <span className="text-xs font-medium text-muted-foreground">{healthLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PainPointsCard({ insights }: Pick<Props, "insights">) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2 pt-4">
        {headlineWithTooltip("Pain points and suggested fixes", PAIN_POINTS_HELP)}
      </CardHeader>
      <CardContent className="flex-1 space-y-2 pb-4">
        {insights.insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No major issues detected with the current numbers. Keep buffers in mind when the
            scenario changes.
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.insights.map((item) => (
              <li
                key={item.id}
                className="rounded-[10px] border border-border/80 bg-muted/30 p-2.5 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={
                      item.severity === "critical"
                        ? "text-finance-expense"
                        : item.severity === "warning"
                          ? "text-finance-runway"
                          : "text-finance-neutral"
                    }
                  >
                    {item.severity === "critical"
                      ? "Critical"
                      : item.severity === "warning"
                        ? "Warning"
                        : "Note"}
                  </span>
                  <span className="font-medium text-foreground">{item.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                <p className="mt-1.5 text-xs text-foreground/90">
                  <span className="font-medium text-finance-income">Fix: </span>
                  {item.suggestion}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ModeledCashFlowCard({
  insights,
  formatSek,
  recurringNetCashAdjustSek,
}: Props) {
  const month = insights.baselineMonth;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2 pt-4">
        {headlineWithTooltip("Modeled cash flow", MODELED_FLOW_HELP)}
      </CardHeader>
      <CardContent className="flex-1 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Income</p>
            <p className="kpi-tile-value text-finance-income">{formatSek(month.totalIncomeSek)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Engine net</p>
            <p className="kpi-tile-value text-foreground">{formatSek(month.netCashflowSek)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Recurring (out − in)</p>
            <p className="kpi-tile-value text-foreground">{formatSek(recurringNetCashAdjustSek)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">After recurring</p>
            <p
              className={`kpi-tile-value ${insights.netAfterRecurringSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
            >
              {formatSek(insights.netAfterRecurringSek)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyCashflowSnapshotCard({ insights, formatSek }: Props) {
  const { baselineMonth, netAfterRecurringSek, runwayMonths } = insights;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2 pt-4">
        {headlineWithTooltip("Monthly cashflow snapshot", SNAPSHOT_HELP)}
      </CardHeader>
      <CardContent className="flex-1 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-2 sm:gap-3">
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Modeled monthly income</p>
            <p className="kpi-tile-value text-finance-income">
              {formatSek(baselineMonth.totalIncomeSek)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Surplus after recurring</p>
            <p
              className={`kpi-tile-value ${netAfterRecurringSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
            >
              {formatSek(netAfterRecurringSek)}
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
            <p className="kpi-tile-label">Liquidity runway (rough)</p>
            <p className="kpi-tile-value text-finance-runway">
              {runwayMonths} months
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Barometer, pain points, snapshot, and modeled flow — equal-width columns on large screens. */
export function DashboardHealthSection(props: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <HouseholdBarometerCard {...props} />
      <PainPointsCard insights={props.insights} />
      <MonthlyCashflowSnapshotCard {...props} />
      <ModeledCashFlowCard {...props} />
    </div>
  );
}

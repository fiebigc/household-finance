import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { useHouseholdCardValues } from "@/hooks/useHouseholdCardValues";
import { CardNumericFieldsDialog, type CardNumericFieldDef } from "@/components/CardNumericFieldsDialog";
import { formatSEK, formatCompact, formatPercent } from "@/lib/utils";
import { cashflowContributesToPnLTotals } from "@/utils/cashflowAccounts";
import { cashflowExcludedFromHouseholdTotals } from "@/utils/cashflowIncomeVisibility";
import {
  PiggyBank, TrendingUp, Flame, LineChart as LineChartIcon,
  Baby,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from "recharts";

type BentoRender = Parameters<BentoCardDefinition["render"]>[0];

function PensionProjectionCardContent() {
  const { t } = useTranslation();
  const { entities } = useAppStore();
  const { values } = useHouseholdCardValues();
  const adults = entities.filter(e => e.type === "adult");
  const rate = values.retirement.pensionAnnualGrowthRate;
  const seeds = values.retirement.pensionStartingMonthlyByAdult;

  const data = useMemo(() => {
    return Array.from({ length: 35 }, (_, i) => {
      const year = new Date().getFullYear() + i;
      const entry: Record<string, unknown> = { year };
      adults.forEach(a => {
        const seed = seeds[a.id] ?? 0;
        entry[a.name] = Math.round(seed * Math.pow(1 + rate, i));
      });
      return entry;
    });
  }, [adults, rate, seeds]);

  const colors = ["#3b82f6", "#8b5cf6"];

  return (
    <div>
      {adults.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">{t("cards.retirement.pension_empty_hint")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <defs>
              {adults.map((a, i) => (
                <linearGradient key={a.id} id={`pension-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i]} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={colors[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
            <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {adults.map((a, i) => (
              <Area
                key={a.id}
                type="monotone"
                dataKey={a.name}
                stroke={colors[i]}
                fill={`url(#pension-grad-${i})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PensionProjectionCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { entities } = useAppStore();
  const { values, update } = useHouseholdCardValues();
  const adults = entities.filter(e => e.type === "adult");
  const fields: CardNumericFieldDef[] = [
    {
      key: "growthPct",
      label: t("cards.retirement.pension_growth_field"),
    },
    ...adults.map(a => ({
      key: `seed_${a.id}`,
      label: t("cards.retirement.pension_seed_field", { name: a.name }),
    })),
  ];
  const initial: Record<string, number | null> = {
    growthPct: values.retirement.pensionAnnualGrowthRate * 100,
    ...Object.fromEntries(adults.map(a => [`seed_${a.id}`, values.retirement.pensionStartingMonthlyByAdult[a.id] ?? 0])),
  };

  return (
    <>
      <Card
        title={t("cards.retirement.pension_projection")}
        subtitle={t("cards.retirement.pension_projection_sub")}
        icon={<PiggyBank className="w-4 h-4" />}
        onEdit={() => setOpen(true)}
        {...p}
      >
        <PensionProjectionCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.retirement.pension_dialog")}
        description={t("cards.retirement.pension_dialog_desc")}
        fields={fields}
        initial={initial}
        onSave={(next) => {
          const growth = ((next.growthPct as number) ?? 0) / 100;
          const pensionStartingMonthlyByAdult: Record<string, number> = {};
          for (const a of adults) {
            pensionStartingMonthlyByAdult[a.id] = (next[`seed_${a.id}`] as number) ?? 0;
          }
          update((v) => ({
            ...v,
            retirement: {
              ...v.retirement,
              pensionAnnualGrowthRate: growth,
              pensionStartingMonthlyByAdult,
            },
          }));
        }}
      />
    </>
  );
}

function liquidAccountsTotal(accounts: { type: string; balance_snapshot: number }[]): number {
  return accounts
    .filter(a => ["bank", "savings", "investment", "pension"].includes(a.type))
    .reduce((s, a) => s + (a.balance_snapshot || 0), 0);
}

function FireNumberCardContent() {
  const { t } = useTranslation();
  const { cashflows, accounts } = useAppStore();
  const { values } = useHouseholdCardValues();
  const annualExpenses = cashflows
    .filter(
      (c) =>
        c.direction === "expense" &&
        cashflowContributesToPnLTotals(c, accounts) &&
        !cashflowExcludedFromHouseholdTotals(c),
    )
    .reduce((s, c) => s + c.amount * 12, 0);
  const fireNumber = annualExpenses * 25;
  const liquid = liquidAccountsTotal(accounts);
  const currentSavings = values.retirement.fireSavingsOverride ?? liquid;
  const progress = fireNumber > 0 ? Math.min(1, currentSavings / fireNumber) : 0;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">{t("cards.retirement.fire_heading")}</p>
        <p className="text-2xl font-bold tabular-nums">{formatSEK(fireNumber)}</p>
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{t("cards.retirement.progress")}</span>
          <span>{formatPercent(progress)}</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-income transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">{t("cards.retirement.current_savings")}</p>
          <p className="font-medium tabular-nums">{formatSEK(currentSavings)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("cards.retirement.gap")}</p>
          <p className="font-medium tabular-nums">{formatSEK(fireNumber - currentSavings)}</p>
        </div>
      </div>
    </div>
  );
}

function FireNumberCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { accounts } = useAppStore();
  const { values, update } = useHouseholdCardValues();
  const liquid = liquidAccountsTotal(accounts);

  return (
    <>
      <Card title={t("cards.retirement.fire_target")} icon={<Flame className="w-4 h-4" />} onEdit={() => setOpen(true)} {...p}>
        <FireNumberCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.retirement.fire_dialog")}
        description={t("cards.retirement.fire_dialog_desc", { amount: formatSEK(liquid) })}
        fields={[
          {
            key: "fire",
            label: t("cards.retirement.fire_override_label"),
            allowEmpty: true,
            hint: t("cards.retirement.fire_override_hint"),
          },
        ]}
        initial={{ fire: values.retirement.fireSavingsOverride }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            retirement: { ...v.retirement, fireSavingsOverride: next.fire },
          }))
        }
      />
    </>
  );
}

function InvestmentGrowthCardContent() {
  const { t } = useTranslation();
  const { accounts } = useAppStore();
  const investments = accounts.filter(a => a.type === "investment" || a.type === "pension");
  const totalNow = investments.reduce((s, a) => s + (a.balance_snapshot || 0), 0);

  const scenarios = useMemo(
    () => [
      { name: t("cards.retirement.scenario_conservative"), rate: 0.04, color: "#06b6d4" },
      { name: t("cards.retirement.scenario_moderate"), rate: 0.07, color: "#10b981" },
      { name: t("cards.retirement.scenario_aggressive"), rate: 0.1, color: "#f59e0b" },
    ],
    [t],
  );

  const data = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const entry: Record<string, unknown> = { year: new Date().getFullYear() + i };
      scenarios.forEach(s => {
        entry[s.name] = Math.round(totalNow * Math.pow(1 + s.rate, i));
      });
      return entry;
    });
  }, [totalNow, scenarios]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        <Legend wrapperStyle={{ fontSize: "10px" }} />
        {scenarios.map(s => (
          <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function NetWorthTrajectoryCardContent() {
  const { t } = useTranslation();
  const { accounts, loans } = useAppStore();
  const { values } = useHouseholdCardValues();
  const g = values.retirement.netWorthAnnualAssetGrowth;
  const debtFactor = values.retirement.netWorthAnnualDebtFactor;
  const totalAssets = accounts.filter(a => a.type !== "loan" && a.type !== "credit").reduce((s, a) => s + (a.balance_snapshot || 0), 0);
  const totalDebt = loans.reduce((s, l) => s + l.outstanding, 0);

  const netKey = t("cards.retirement.chart_net_worth");
  const assetsKey = t("cards.retirement.chart_assets");
  const debtKey = t("cards.retirement.chart_debt");

  const data = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        year: new Date().getFullYear() + i,
        [assetsKey]: Math.round(totalAssets * Math.pow(1 + g, i)),
        [debtKey]: Math.round(totalDebt * Math.pow(debtFactor, i)),
        [netKey]: Math.round(totalAssets * Math.pow(1 + g, i) - totalDebt * Math.pow(debtFactor, i)),
      })),
    [assetsKey, debtFactor, debtKey, g, netKey, totalAssets, totalDebt],
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        <Legend wrapperStyle={{ fontSize: "10px" }} />
        <Area type="monotone" dataKey={netKey} stroke="hsl(142 71% 45%)" fill="url(#nw-grad)" strokeWidth={2} />
        <Area type="monotone" dataKey={assetsKey} stroke="#3b82f6" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
        <Area type="monotone" dataKey={debtKey} stroke="hsl(0 84% 60%)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function NetWorthTrajectoryCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values, update } = useHouseholdCardValues();
  return (
    <>
      <Card
        title={t("cards.retirement.net_worth_trajectory")}
        subtitle={t("cards.retirement.net_worth_sub")}
        icon={<LineChartIcon className="w-4 h-4" />}
        onEdit={() => setOpen(true)}
        {...p}
      >
        <NetWorthTrajectoryCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.retirement.net_worth_dialog")}
        description={t("cards.retirement.net_worth_dialog_desc")}
        fields={[
          { key: "assetPct", label: t("cards.retirement.nw_asset_pct") },
          { key: "debtFactor", label: t("cards.retirement.nw_debt_factor") },
        ]}
        initial={{
          assetPct: values.retirement.netWorthAnnualAssetGrowth,
          debtFactor: values.retirement.netWorthAnnualDebtFactor,
        }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            retirement: {
              ...v.retirement,
              netWorthAnnualAssetGrowth: (next.assetPct as number) ?? 0,
              netWorthAnnualDebtFactor: (next.debtFactor as number) ?? 1,
            },
          }))
        }
      />
    </>
  );
}

function LeavePensionImpactCardContent() {
  const { t } = useTranslation();
  const { entities, periods } = useAppStore();
  const { values } = useHouseholdCardValues();
  const adults = entities.filter(e => e.type === "adult");
  const gap = values.retirement.leavePensionGapPerMonth;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("cards.retirement.leave_intro")}</p>
      {adults.map(adult => {
        const leaves = periods.filter(p =>
          p.entity_id === adult.id &&
          (p.type === "parental_leave" || p.type === "unpaid_leave")
        );
        const totalMonths = leaves.reduce((s, l) => {
          const from = new Date(l.date_from);
          const to = l.date_to ? new Date(l.date_to) : new Date();
          return s + Math.max(0, (to.getTime() - from.getTime()) / (30 * 24 * 60 * 60 * 1000));
        }, 0);

        return (
          <div key={adult.id} className="p-3 rounded-bento-inner bg-muted/30">
            <h4 className="text-xs font-medium mb-1">{adult.name}</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">{t("cards.retirement.leave_months")}</p>
                <p className="font-medium tabular-nums">{Math.round(totalMonths)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("cards.retirement.leave_gap_est")}</p>
                <p className="font-medium tabular-nums text-expense">{formatSEK(Math.round(totalMonths * gap))}</p>
              </div>
            </div>
          </div>
        );
      })}
      {adults.length === 0 && <p className="text-xs text-muted-foreground">{t("cards.retirement.no_adults")}</p>}
    </div>
  );
}

function LeavePensionImpactCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values, update } = useHouseholdCardValues();
  return (
    <>
      <Card
        title={t("cards.retirement.leave_pension_impact")}
        subtitle={t("cards.retirement.leave_sub")}
        icon={<Baby className="w-4 h-4" />}
        onEdit={() => setOpen(true)}
        {...p}
      >
        <LeavePensionImpactCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.retirement.leave_dialog")}
        description={t("cards.retirement.leave_dialog_desc")}
        fields={[{ key: "gap", label: t("cards.retirement.leave_gap_field") }]}
        initial={{ gap: values.retirement.leavePensionGapPerMonth }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            retirement: { ...v.retirement, leavePensionGapPerMonth: (next.gap as number) ?? 0 },
          }))
        }
      />
    </>
  );
}

export function useRetirementBentoCards(): BentoCardDefinition[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        id: "pension-projection",
        title: t("cards.retirement.pension_projection"),
        defaultSize: "large",
        render: (p) => <PensionProjectionCard {...p} />,
      },
      {
        id: "fire-number",
        title: t("cards.retirement.fire_target"),
        defaultSize: "small",
        render: (p) => <FireNumberCard {...p} />,
      },
      {
        id: "investment-growth",
        title: t("cards.retirement.investment_growth"),
        defaultSize: "medium",
        render: (p) => (
          <Card title={t("cards.retirement.investment_growth")} subtitle={t("cards.retirement.investment_growth_sub")} icon={<TrendingUp className="w-4 h-4" />} {...p}>
            <InvestmentGrowthCardContent />
          </Card>
        ),
      },
      {
        id: "net-worth-trajectory",
        title: t("cards.retirement.net_worth_trajectory"),
        defaultSize: "medium",
        render: (p) => <NetWorthTrajectoryCard {...p} />,
      },
      {
        id: "leave-pension-impact",
        title: t("cards.retirement.leave_pension_impact"),
        defaultSize: "small",
        render: (p) => <LeavePensionImpactCard {...p} />,
      },
    ],
    [t],
  );
}

export function RetirementPage() {
  const cards = useRetirementBentoCards();
  return <BentoGrid tab="retirement" cards={cards} />;
}

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AccountBalancePoint } from "@/data/bankLiquidityHistory";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Range = "1m" | "3m" | "6m" | "all";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "1m", label: "1 mo" },
  { value: "3m", label: "3 mo" },
  { value: "6m", label: "6 mo" },
  { value: "all", label: "All" },
];

const RANGE_MONTHS: Record<Range, number | null> = { "1m": 1, "3m": 3, "6m": 6, all: null };

const ACCOUNT_COLORS: Record<string, string> = {
  household: "hsl(var(--finance-income))",
  shared: "hsl(var(--finance-runway))",
  christian: "hsl(var(--finance-expense))",
  combined: "hsl(var(--foreground))",
};

type Props = {
  data: AccountBalancePoint[];
  className?: string;
};

export function CashflowTrajectoryChart({ data, className }: Props) {
  const { t, numberLocale } = useI18n();
  const [range, setRange] = useState<Range>("6m");

  const months = RANGE_MONTHS[range];
  const sliced = months !== null ? data.slice(-months) : data;

  const formatSek = (n: number) =>
    `${Math.round(n).toLocaleString(numberLocale)} ${t("common.currency")}`;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              range === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={sliced} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              const label = t(`chart.line_${String(name)}`) || String(name);
              return [formatSek(Number.isFinite(n) ? n : 0), label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
            formatter={(value) => t(`chart.line_${String(value)}`) || String(value)}
          />
          <Line
            type="monotone"
            dataKey="combined"
            stroke={ACCOUNT_COLORS.combined}
            strokeWidth={2.5}
            dot={false}
            name="combined"
          />
          <Line
            type="monotone"
            dataKey="household"
            stroke={ACCOUNT_COLORS.household}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="household"
          />
          <Line
            type="monotone"
            dataKey="shared"
            stroke={ACCOUNT_COLORS.shared}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="shared"
          />
          <Line
            type="monotone"
            dataKey="christian"
            stroke={ACCOUNT_COLORS.christian}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="christian"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

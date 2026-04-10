import { useMemo } from "react";
import { InfoTip } from "@/components/InfoTip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BALANCE_SHEET_AS_OF,
  investmentTransfers,
  type BankAccountRow,
  type PersonaKey,
} from "@/data/realWorldBalanceSheet";
import { useI18n } from "@/i18n/I18nContext";

function ownerLabel(t: (k: string) => string, key: PersonaKey): string {
  if (key === "joint") return t("balances.ownerJoint");
  if (key === "christian") return t("balances.ownerChristian");
  if (key === "aaro") return t("balances.ownerAaro");
  if (key === "heli") return "Heli";
  if (key === "unto") return "Unto";
  return key;
}

const LOAN_CATEGORIES = new Set(["mortgage_debt"]);
const INVESTMENT_CATEGORIES = new Set(["investment_external", "investment_transfer"]);

function sortRank(row: BankAccountRow, currentUser: string): number {
  if (INVESTMENT_CATEGORIES.has(row.category)) return 4;
  if (LOAN_CATEGORIES.has(row.category)) return 3;
  const isJoint = row.owners.length === 1 && row.owners[0] === "joint";
  if (isJoint) return 2;
  const isMine = row.owners.includes(currentUser as PersonaKey);
  return isMine ? 0 : 1;
}

type Props = { accounts: BankAccountRow[]; currentUserKey: string };

export function RealBalancesCard({ accounts, currentUserKey }: Props) {
  const { t, numberLocale } = useI18n();

  const sorted = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const ra = sortRank(a, currentUserKey);
      const rb = sortRank(b, currentUserKey);
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label);
    });
  }, [accounts, currentUserKey]);

  const bankAccounts = sorted.filter((a) => !INVESTMENT_CATEGORIES.has(a.category));
  const investmentAccounts = sorted.filter((a) => INVESTMENT_CATEGORIES.has(a.category));

  const fmt = (n: number | null) =>
    n === null
      ? t("balances.pending")
      : n.toLocaleString(numberLocale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <Card className="self-start">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <CardTitle className="text-sm">{t("balances.title")}</CardTitle>
        <InfoTip text={t("balances.titleTip")} />
        <span className="ml-auto text-[10px] text-muted-foreground">{t("balances.asOf", { date: BALANCE_SHEET_AS_OF })}</span>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">{t("balances.account")}</TableHead>
              <TableHead className="text-[11px]">{t("balances.owners")}</TableHead>
              <TableHead className="text-right text-[11px]">{t("balances.balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="py-1.5">
                  <span className="font-medium">{row.label}</span>
                  {row.notes && <InfoTip text={row.notes} className="ml-1" />}
                </TableCell>
                <TableCell className="py-1.5 text-muted-foreground">
                  {row.owners.map((o) => ownerLabel(t, o)).join(" · ")}
                </TableCell>
                <TableCell
                  className={`py-1.5 text-right tabular-nums ${row.balanceSek !== null && row.balanceSek < 0 ? "text-finance-expense" : ""}`}
                >
                  {fmt(row.balanceSek)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {investmentAccounts.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-medium">{t("balances.externalInvestments")}</p>
            <Table>
              <TableBody>
                {investmentAccounts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="py-1">
                      <span className="font-medium">{row.label}</span>
                      {row.notes && <InfoTip text={row.notes} className="ml-1" />}
                    </TableCell>
                    <TableCell className="py-1 text-muted-foreground">
                      {row.owners.map((o) => ownerLabel(t, o)).join(" · ")}
                    </TableCell>
                    <TableCell className="py-1 text-right tabular-nums">{fmt(row.balanceSek)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {investmentTransfers.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-medium">{t("balances.investmentTransfers")}</p>
            <Table>
              <TableBody>
                {investmentTransfers.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="py-1">{row.label}</TableCell>
                    <TableCell className="py-1 text-muted-foreground">{ownerLabel(t, row.owner)}</TableCell>
                    <TableCell className="py-1 text-right tabular-nums">
                      {(-row.monthlySek).toLocaleString(numberLocale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

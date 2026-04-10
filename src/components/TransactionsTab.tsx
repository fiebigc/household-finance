import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { MergedTransaction } from "@/data/allTransactions";
import { useI18n } from "@/i18n/I18nContext";

const PAGE_SIZE = 50;

type Props = { transactions: MergedTransaction[] };

export function TransactionsTab({ transactions }: Props) {
  const { t, numberLocale } = useI18n();
  const all = transactions;
  const [filter, setFilter] = useState("__all__");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const accounts = useMemo(
    () => Array.from(new Set(all.map((r) => r.account))).sort(),
    [all],
  );

  const filtered = useMemo(() => {
    let rows: MergedTransaction[] = all;
    if (filter !== "__all__") rows = rows.filter((r) => r.account === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.specifikation.toLowerCase().includes(q) || r.dateStr.includes(q),
      );
    }
    return rows;
  }, [all, filter, search]);

  const visible = filtered.slice(0, shown);

  const fmt = (n: number) =>
    n.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 pb-3">
        <CardTitle className="text-base">{t("transactions.title")}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {t("transactions.showing", { count: String(visible.length), total: String(filtered.length) })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-44"
            placeholder={t("transactions.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
          />
          <Select value={filter} onValueChange={(v) => { setFilter(v); setShown(PAGE_SIZE); }}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("transactions.allAccounts")}</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("transactions.noData")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">{t("transactions.date")}</TableHead>
                    <TableHead className="w-28">{t("transactions.account")}</TableHead>
                    <TableHead>{t("transactions.description")}</TableHead>
                    <TableHead className="w-28 text-right">{t("transactions.amount")}</TableHead>
                    <TableHead className="w-28 text-right">{t("transactions.saldo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r, i) => {
                    const isIncome = r.belopp >= 0;
                    return (
                      <TableRow
                        key={`${r.dateStr}-${r.account}-${i}`}
                        className={isIncome
                          ? "bg-green-50/50 dark:bg-green-950/20"
                          : "bg-red-50/40 dark:bg-red-950/15"}
                      >
                        <TableCell className="tabular-nums">{r.dateStr}</TableCell>
                        <TableCell className="text-muted-foreground">{r.account}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.specifikation}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${isIncome ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {isIncome ? "+" : ""}{fmt(r.belopp)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.saldo !== null ? fmt(r.saldo) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {shown < filtered.length && (
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setShown((s) => s + PAGE_SIZE)}>
                  {t("transactions.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BentoCardSurfaceTheme } from "@/config/bentoCardSurfaces";
import {
  expenseBoardTotalSek,
  newExpenseTrackerBoard,
  newExpenseTrackerLine,
  type ExpenseTrackerBoard,
} from "@/utils/finance/expenseTrackerModel";
import { cn } from "@/lib/utils";

export type ExpenseTrackerTabProps = {
  boards: ExpenseTrackerBoard[];
  setBoards: Dispatch<SetStateAction<ExpenseTrackerBoard[]>>;
  formatSek: (value: number) => string;
  cardSurface: BentoCardSurfaceTheme;
};

export function ExpenseTrackerTab({
  boards,
  setBoards,
  formatSek,
  cardSurface,
}: ExpenseTrackerTabProps) {
  const addBoard = () => {
    setBoards((prev) => [...prev, newExpenseTrackerBoard("New project", prev.length)]);
  };

  const removeBoard = (boardId: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
  };

  const patchBoard = (boardId: string, fn: (b: ExpenseTrackerBoard) => ExpenseTrackerBoard) => {
    setBoards((prev) => prev.map((b) => (b.id === boardId ? fn(b) : b)));
  };

  return (
    <div className="finance-bento">
      <div className="bento-span-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Track one-off costs per project (kitchen, garden, …). Lists sync to Supabase when
          configured.
        </p>
        <Button type="button" size="sm" variant="secondary" className="h-9 shrink-0" onClick={addBoard}>
          <Plus className="mr-1 size-3.5" aria-hidden />
          New list
        </Button>
      </div>

      <div className="bento-span-full grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {boards.map((board) => {
          const total = expenseBoardTotalSek(board);
          return (
            <Card key={board.id} bentoSurface={cardSurface} className="min-w-0">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={`et-title-${board.id}`} className="text-xs text-muted-foreground">
                    List name
                  </Label>
                  <Input
                    id={`et-title-${board.id}`}
                    className="h-9 text-sm font-semibold"
                    value={board.title}
                    onChange={(e) =>
                      patchBoard(board.id, (b) => ({ ...b, title: e.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-muted-foreground hover:text-finance-expense"
                  title="Remove this list"
                  onClick={() => removeBoard(board.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                  <span className="text-xs font-medium text-muted-foreground">Total</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatSek(total)}
                  </span>
                </div>
                <ul className="space-y-2">
                  {board.items.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-end gap-2 rounded-lg border border-border/50 bg-muted/15 p-2 dark:bg-muted/10"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground" htmlFor={`et-l-${line.id}`}>
                          Cost name
                        </Label>
                        <Input
                          id={`et-l-${line.id}`}
                          className="h-8 text-sm"
                          value={line.label}
                          onChange={(e) =>
                            patchBoard(board.id, (b) => ({
                              ...b,
                              items: b.items.map((x) =>
                                x.id === line.id ? { ...x, label: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="w-[min(100%,8rem)] space-y-1">
                        <Label className="text-[10px] text-muted-foreground" htmlFor={`et-a-${line.id}`}>
                          SEK
                        </Label>
                        <Input
                          id={`et-a-${line.id}`}
                          type="number"
                          min={0}
                          step={50}
                          className="h-8 text-sm tabular-nums"
                          inputMode="numeric"
                          value={line.amountSek}
                          onChange={(e) => {
                            const n = Math.max(0, Number(e.target.value || 0));
                            patchBoard(board.id, (b) => ({
                              ...b,
                              items: b.items.map((x) =>
                                x.id === line.id ? { ...x, amountSek: n } : x,
                              ),
                            }));
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 px-2 text-muted-foreground hover:text-finance-expense",
                          board.items.length <= 1 ? "invisible pointer-events-none" : "",
                        )}
                        title="Remove line"
                        onClick={() =>
                          patchBoard(board.id, (b) => ({
                            ...b,
                            items: b.items.filter((x) => x.id !== line.id),
                          }))
                        }
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={() =>
                    patchBoard(board.id, (b) => ({
                      ...b,
                      items: [...b.items, newExpenseTrackerLine("", 0)],
                    }))
                  }
                >
                  <Plus className="mr-1 size-3.5" aria-hidden />
                  Add cost
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {boards.length === 0 ? (
        <p className="bento-span-full text-sm text-muted-foreground">
          No lists yet. Use <span className="font-medium text-foreground">New list</span> to start
          tracking a project.
        </p>
      ) : null}
    </div>
  );
}

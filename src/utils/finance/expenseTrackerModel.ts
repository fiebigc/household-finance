/**
 * Expense tracker boards: named lists of one-off / manual cost lines (not bank import).
 */

export type ExpenseTrackerLine = {
  id: string;
  label: string;
  /** Non-negative SEK amount for this line. */
  amountSek: number;
};

export type ExpenseTrackerBoard = {
  id: string;
  title: string;
  items: ExpenseTrackerLine[];
  sortOrder: number;
};

function newId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}

export function newExpenseTrackerLine(label = "", amountSek = 0): ExpenseTrackerLine {
  return {
    id: newId("etl"),
    label: label.trim(),
    amountSek: Number.isFinite(amountSek) && amountSek >= 0 ? amountSek : 0,
  };
}

export function newExpenseTrackerBoard(title: string, sortOrder = 0): ExpenseTrackerBoard {
  return {
    id: newId("etb"),
    title: title.trim() || "Untitled list",
    items: [],
    sortOrder,
  };
}

export function expenseBoardTotalSek(board: ExpenseTrackerBoard): number {
  return board.items.reduce((sum, line) => {
    const n = line.amountSek;
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function parseLine(raw: unknown, index: number): ExpenseTrackerLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `etl-${index}`;
  const label = typeof o.label === "string" ? o.label : "";
  const amt = o.amountSek;
  const n =
    typeof amt === "number" && Number.isFinite(amt)
      ? Math.max(0, amt)
      : typeof amt === "string" && amt.trim() !== "" && Number.isFinite(Number(amt))
        ? Math.max(0, Number(amt))
        : 0;
  return { id, label, amountSek: n };
}

export function parseExpenseTrackerBoard(
  raw: unknown,
  fallbackSortOrder: number,
): ExpenseTrackerBoard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newId("etb");
  const title =
    typeof o.title === "string" && o.title.trim()
      ? o.title.trim()
      : typeof o.name === "string" && o.name.trim()
        ? o.name.trim()
        : "Untitled list";
  const sortOrder =
    typeof o.sort_order === "number" && Number.isFinite(o.sort_order)
      ? o.sort_order
      : typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder)
        ? o.sortOrder
        : fallbackSortOrder;
  const itemsRaw = o.items;
  const items: ExpenseTrackerLine[] = [];
  if (Array.isArray(itemsRaw)) {
    itemsRaw.forEach((row, i) => {
      const line = parseLine(row, i);
      if (line) items.push(line);
    });
  }
  return { id, title, items, sortOrder };
}

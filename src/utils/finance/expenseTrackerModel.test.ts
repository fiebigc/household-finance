import { describe, expect, it } from "vitest";
import {
  expenseBoardTotalSek,
  newExpenseTrackerBoard,
  newExpenseTrackerLine,
  parseExpenseTrackerBoard,
} from "./expenseTrackerModel";

describe("expenseTrackerModel", () => {
  it("expenseBoardTotalSek sums positive finite amounts", () => {
    const board = newExpenseTrackerBoard("Kitchen", 0);
    board.items = [
      newExpenseTrackerLine("Tiles", 12000),
      newExpenseTrackerLine("Labor", 45000),
      { ...newExpenseTrackerLine("Bad", -100), amountSek: -100 },
      { ...newExpenseTrackerLine("NaN", 0), amountSek: Number.NaN },
    ];
    expect(expenseBoardTotalSek(board)).toBe(57_000);
  });

  it("parseExpenseTrackerBoard reads DB-shaped row", () => {
    const b = parseExpenseTrackerBoard(
      {
        id: "etb-1",
        title: "Garden",
        sort_order: 2,
        items: [
          { id: "l1", label: "Soil", amountSek: 800 },
          { id: "l2", label: "Plants", amountSek: "1200" },
        ],
      },
      0,
    );
    expect(b).not.toBeNull();
    expect(b!.title).toBe("Garden");
    expect(b!.sortOrder).toBe(2);
    expect(b!.items).toHaveLength(2);
    expect(expenseBoardTotalSek(b!)).toBe(2000);
  });
});

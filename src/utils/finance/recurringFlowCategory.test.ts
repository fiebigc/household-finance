import { describe, expect, it } from "vitest";
import { normalizeRecurringFlowCategoryId, recurringFlowCategoryLabel } from "./recurringFlowCategory";

describe("recurringFlowCategory", () => {
  it("normalizes unknown values to other", () => {
    expect(normalizeRecurringFlowCategoryId(undefined)).toBe("other");
    expect(normalizeRecurringFlowCategoryId("nope")).toBe("other");
  });

  it("accepts known ids", () => {
    expect(normalizeRecurringFlowCategoryId("housing")).toBe("housing");
  });

  it("labels every known id", () => {
    expect(recurringFlowCategoryLabel("housing").length).toBeGreaterThan(0);
  });
});

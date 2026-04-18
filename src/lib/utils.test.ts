import { describe, expect, it } from "vitest";
import { formatUnknownError } from "./utils";

describe("formatUnknownError", () => {
  it("formats PostgREST-shaped objects", () => {
    const s = formatUnknownError({
      code: "23503",
      message: "insert or update violates foreign key constraint",
      details: 'Key (bank_account_id)=(acc-x) is not present in table "app_bank_accounts".',
    });
    expect(s).toContain("23503");
    expect(s).toContain("foreign key");
    expect(s).toContain("acc-x");
  });

  it("uses Error.message", () => {
    expect(formatUnknownError(new Error("oops"))).toBe("oops");
  });
});

import { describe, expect, it } from "vitest";
import { pensionBracketLabelToEn } from "./pensionPortalDisplay";

describe("pensionBracketLabelToEn", () => {
  it("maps age bands with år to years", () => {
    expect(pensionBracketLabelToEn("65–66 år")).toBe("65-66 years");
    expect(pensionBracketLabelToEn("65-66 år")).toBe("65-66 years");
  });

  it("maps open-ended band", () => {
    expect(pensionBracketLabelToEn("75 år och livet ut")).toBe("75 years and for life");
  });
});

import { describe, expect, it } from "vitest";
import {
  parsePlanningPortalSnapshot,
  patchPensionColumnMeta,
  type PlanningPortalReference,
} from "./planningPortalSnapshot";

const FK = {
  childLabel: "U",
  totalRemaining: 1,
  totalCap: 480,
  duRemaining: 1,
  partnerRemaining: 1,
  sjukpenningnivaDu: 1,
  lagstaDu: 0,
  sjukpenningnivaPartner: 0,
  lagstaPartner: 0,
} as const;

const P65 = {
  title: "P",
  salaryTodaySek: 1000,
  brackets: [{ label: "65–66", sekPerMonth: 100 }],
};

const PREM = {
  title: "Pr",
  blurb: "B",
  totalValueSek: 100,
  valueChangeYtdPct: 1,
  avgAnnualSinceStartPct: 2,
  portfolioFeePct: 0.1,
  avgCustomerFeePct: 0.2,
};

/** Minimal valid snapshot with explicit pension columns (multi-member). */
const VALID_MULTI: PlanningPortalReference = {
  sourceNote: "Test",
  unto: { ...FK },
  aaro: { ...FK, childLabel: "A", totalRemaining: 2 },
  pensionColumns: [
    {
      ownerAccountRef: "user-a",
      displayLabel: "Member A",
      pensionFrom65: P65,
      premiepension: PREM,
    },
    {
      ownerAccountRef: "user-b",
      displayLabel: "Member B",
      pensionFrom65: { ...P65, title: "P2" },
      premiepension: { ...PREM, totalValueSek: 200 },
    },
  ],
};

describe("planningPortalSnapshot", () => {
  it("parses pensionColumns layout", () => {
    const parsed = parsePlanningPortalSnapshot(VALID_MULTI);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("parsed");
    expect(parsed.pensionColumns).toHaveLength(2);
    expect(parsed.pensionColumns[0]!.displayLabel).toBe("Member A");
    expect(parsed.pensionColumns[1]!.ownerAccountRef).toBe("user-b");
  });

  it("normalizes legacy single-column JSON", () => {
    const legacy = {
      sourceNote: "Legacy",
      unto: VALID_MULTI.unto,
      aaro: VALID_MULTI.aaro,
      pensionFrom65: P65,
      premiepension: PREM,
      pensionDisplayLabel: "Household pension",
      pensionOwnerAccountRef: "legacy-owner",
    };
    const parsed = parsePlanningPortalSnapshot(legacy);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("parsed");
    expect(parsed.pensionColumns).toHaveLength(1);
    expect(parsed.pensionColumns[0]!.displayLabel).toBe("Household pension");
    expect(parsed.pensionColumns[0]!.ownerAccountRef).toBe("legacy-owner");
  });

  it("accepts snake_case column fields", () => {
    const raw = {
      sourceNote: "S",
      unto: VALID_MULTI.unto,
      aaro: VALID_MULTI.aaro,
      pensionColumns: [
        {
          display_label: "From snake",
          owner_account_ref: "x",
          pensionFrom65: P65,
          premiepension: PREM,
        },
      ],
    };
    const parsed = parsePlanningPortalSnapshot(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("parsed");
    expect(parsed.pensionColumns[0]!.displayLabel).toBe("From snake");
    expect(parsed.pensionColumns[0]!.ownerAccountRef).toBe("x");
  });

  it("returns null for empty or invalid payload", () => {
    expect(parsePlanningPortalSnapshot(null)).toBeNull();
    expect(parsePlanningPortalSnapshot({})).toBeNull();
    expect(parsePlanningPortalSnapshot({ sourceNote: "x" })).toBeNull();
  });

  it("patchPensionColumnMeta updates one column only", () => {
    const next = patchPensionColumnMeta(VALID_MULTI, 0, {
      displayLabel: "Chris",
      ownerAccountRef: "entity-1",
    });
    expect(next.pensionColumns[0]!.displayLabel).toBe("Chris");
    expect(next.pensionColumns[0]!.ownerAccountRef).toBe("entity-1");
    expect(next.pensionColumns[1]!.displayLabel).toBe("Member B");
    expect(next.pensionColumns[1]!.ownerAccountRef).toBe("user-b");
  });
});

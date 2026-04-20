import { describe, expect, it } from "vitest";
import {
  applyBentoSurfacePreset,
  buildDefaultMixMap,
  DEFAULT_MIX_SURFACE_OVERRIDES,
} from "./bentoCardSurfaces";

describe("bentoCardSurfaces", () => {
  it("default mix sets dark hero tiles, ocean current chart, dark scenario chart", () => {
    const m = buildDefaultMixMap();
    expect(m.health_barometer).toBe("dark");
    expect(m.household_snapshot).toBe("dark");
    expect(m.trend_chart).toBe("ocean");
    expect(m.scenario_trend_chart).toBe("dark");
    expect(m.bank_accounts).toBe("light");
  });

  it("applyBentoSurfacePreset all_light clears overrides", () => {
    const m = applyBentoSurfacePreset("all_light");
    expect(m.health_barometer).toBe("light");
    expect(m.trend_chart).toBe("light");
    expect(DEFAULT_MIX_SURFACE_OVERRIDES.health_barometer).toBe("dark");
  });
});

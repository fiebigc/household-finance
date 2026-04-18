import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeTinkCallbackFromUrl } from "./tinkService";

describe("consumeTinkCallbackFromUrl", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("returns idle when no tink query params", () => {
    window.history.replaceState({}, "", "/app");
    const r = consumeTinkCallbackFromUrl({ replaceHistory: false });
    expect(r.status).toBe("idle");
    expect(r.raw).toEqual({});
  });

  it("parses success and strips params when replaceHistory is true", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    window.history.replaceState({}, "", "/?tink_status=success&tink_message=Done&other=1");
    replaceState.mockClear();
    const r = consumeTinkCallbackFromUrl({ replaceHistory: true });
    expect(r.status).toBe("success");
    expect(r.message).toBe("Done");
    expect(replaceState).toHaveBeenCalled();
    const last = replaceState.mock.calls.at(-1) as [unknown, unknown, string] | undefined;
    const url = last?.[2];
    expect(url).toContain("other=1");
    expect(url).not.toContain("tink_status");
  });
});

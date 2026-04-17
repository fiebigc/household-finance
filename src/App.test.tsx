import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App smoke test", () => {
  it("renders auth or env warning screen", () => {
    render(<App />);
    const login = screen.queryByText("Login");
    const envWarn = screen.queryByText("Supabase not configured");
    expect(Boolean(login || envWarn)).toBe(true);
  });
});

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses `<input type="number">` / numeric text (allows comma as decimal separator).
 * Returns null when the field is empty so callers can avoid overwriting with 0 while typing.
 */
export function parseOptionalNumberInput(raw: string): number | null {
  const t = raw.trim().replace(/\u00a0/g, "").replace(/\s/g, "");
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Supabase/PostgREST errors are often plain objects (`{ message, code, details, hint }`), not `Error`.
 * Use this when showing import/API failures in the UI.
 */
export function formatUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e !== null && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof o.code === "string" && o.code) bits.push(`[${o.code}]`);
    if (typeof o.message === "string" && o.message) bits.push(o.message);
    if (typeof o.details === "string" && o.details) bits.push(String(o.details));
    if (typeof o.hint === "string" && o.hint) bits.push(String(o.hint));
    if (bits.length) return bits.join(" ");
  }
  try {
    return String(e);
  } catch {
    return "Unknown error.";
  }
}

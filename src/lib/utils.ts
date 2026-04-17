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

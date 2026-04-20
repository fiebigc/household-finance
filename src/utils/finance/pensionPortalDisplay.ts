/**
 * Normalize Swedish portal pension age-band labels for English UI (data may stay Swedish in DB).
 */
export function pensionBracketLabelToEn(label: string): string {
  let s = label.trim();
  s = s.replace(/\s+år\s+och\s+livet\s+ut/gi, " years and for life");
  s = s.replace(/(\d+)\s*[\u2013\-]\s*(\d+)\s*år\b/gi, "$1-$2 years");
  s = s.replace(/(\d+)\s*år\b/gi, "$1 years");
  s = s.replace(/\bår\b/gi, "years");
  return s;
}

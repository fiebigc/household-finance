import type { CardLayoutEntry, CardSize } from "@/types/schema";

/** Minimal card shape for merging persisted layout with current tab definitions. */
export type BentoCardLayoutSource = {
  id: string;
  defaultSize: CardSize;
  /** First-time visibility when this card enters the saved layout (default true). */
  defaultVisible?: boolean;
};

/**
 * Drops entries whose cards no longer exist and appends missing cards (visible, after max order).
 * When nothing stored yet, uses definition order 0..n-1.
 */
export function mergeCardLayoutWithDefinitions(
  stored: CardLayoutEntry[] | undefined,
  cards: BentoCardLayoutSource[],
): CardLayoutEntry[] {
  const validIds = new Set(cards.map((c) => c.id));

  if (!stored?.length) {
    return cards.map((c, i) => ({
      card_id: c.id,
      size: c.defaultSize,
      order: i,
      visible: c.defaultVisible ?? true,
    }));
  }

  const filtered = stored.filter((l) => validIds.has(l.card_id));
  const present = new Set(filtered.map((l) => l.card_id));
  const maxOrder = Math.max(-1, ...filtered.map((l) => l.order));
  let nextOrder = maxOrder + 1;
  const additions: CardLayoutEntry[] = [];

  for (const c of cards) {
    if (!present.has(c.id)) {
      additions.push({
        card_id: c.id,
        size: c.defaultSize,
        order: nextOrder++,
        visible: c.defaultVisible ?? true,
      });
      present.add(c.id);
    }
  }

  return [...filtered, ...additions].sort((a, b) => a.order - b.order);
}

export function bentoLayoutsEquivalent(a: CardLayoutEntry[], b: CardLayoutEntry[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((x) => [x.card_id, x]));
  for (const x of a) {
    const y = byId.get(x.card_id);
    if (!y || x.order !== y.order || x.size !== y.size || x.visible !== y.visible) return false;
  }
  return true;
}

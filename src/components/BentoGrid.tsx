import { useCallback, useMemo, useEffect, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppStore, type TabId } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { getBoundLocalFileSession } from "@/adapter/fileJson";
import type { CardSize, CardLayoutEntry } from "@/types/schema";
import { cn } from "@/lib/utils";
import { bentoLayoutsEquivalent, mergeCardLayoutWithDefinitions } from "@/utils/bentoCardLayout";
import { useReportHiddenBentoCards } from "@/context/BentoHiddenCardsContext";

const sizeClasses: Record<CardSize, string> = {
  mini: "bento-mini",
  small: "bento-small",
  medium: "bento-medium",
  large: "bento-large",
  full: "bento-full",
};

export interface BentoCardDefinition {
  id: string;
  title: string;
  defaultSize: CardSize;
  /** When this card first appears in saved layout for this tab (default visible). */
  defaultVisible?: boolean;
  render: (props: {
    size: CardSize;
    onHide: () => void;
    onResize: (s: CardSize) => void;
    dragHandleProps: Record<string, unknown>;
  }) => ReactNode;
}

function SortableCard({
  card,
  layout,
  onHide,
  onResize,
}: {
  card: BentoCardDefinition;
  layout: CardLayoutEntry;
  onHide: () => void;
  onResize: (s: CardSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(sizeClasses[layout.size], "min-w-0")}>
      {card.render({
        size: layout.size,
        onHide,
        onResize,
        dragHandleProps: { ...attributes, ...listeners },
      })}
    </div>
  );
}

interface BentoGridProps {
  tab: TabId;
  cards: BentoCardDefinition[];
}

export function BentoGrid({ tab, cards }: BentoGridProps) {
  const { user, cardLayouts, setCardLayout, dataStorageMode } = useAppStore();
  const activeTabGlobal = useAppStore((s) => s.activeTab);
  const backend = useBackend();

  const layoutUserId =
    user?.id ?? (dataStorageMode === "file" ? getBoundLocalFileSession()?.user_id ?? null : null);

  const mergedLayout = useMemo(
    () =>
      mergeCardLayoutWithDefinitions(
        cardLayouts[tab],
        cards.map((c) => ({
          id: c.id,
          defaultSize: c.defaultSize,
          defaultVisible: c.defaultVisible,
        })),
      ),
    [cardLayouts, tab, cards],
  );

  const persist = useCallback(
    (newLayout: CardLayoutEntry[]) => {
      setCardLayout(tab, newLayout);
      const uid = layoutUserId;
      if (uid) {
        backend
          .saveCardLayout({
            id: `${uid}:${tab}`,
            user_id: uid,
            tab,
            cards: newLayout,
            updated_at: new Date().toISOString(),
          })
          .catch(console.error);
      }
    },
    [tab, layoutUserId, backend, setCardLayout],
  );

  useEffect(() => {
    const stored = cardLayouts[tab] ?? [];
    if (bentoLayoutsEquivalent(mergedLayout, stored)) return;
    persist(mergedLayout);
  }, [cardLayouts, tab, mergedLayout, persist]);

  const currentLayout = mergedLayout;

  const visibleCards = useMemo(
    () => currentLayout.filter((l) => l.visible).sort((a, b) => a.order - b.order),
    [currentLayout],
  );
  const hiddenCards = useMemo(() => currentLayout.filter((l) => !l.visible), [currentLayout]);

  const hiddenCardSummaries = useMemo(
    () =>
      hiddenCards
        .map((h) => {
          const def = cards.find((c) => c.id === h.card_id);
          return def ? { card_id: h.card_id, title: def.title } : null;
        })
        .filter((x): x is { card_id: string; title: string } => x != null),
    [hiddenCards, cards],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = visibleCards.findIndex((c) => c.card_id === active.id);
    const newIdx = visibleCards.findIndex((c) => c.card_id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = [...visibleCards];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, order: i }));
    const full = [...updated, ...hiddenCards];
    persist(full);
  };

  const handleHide = (cardId: string) => {
    const updated = currentLayout.map((c) =>
      c.card_id === cardId ? { ...c, visible: false } : c
    );
    persist(updated);
  };

  const handleRestore = useCallback(
    (cardId: string) => {
      const vis = currentLayout.filter((l) => l.visible);
      const maxOrder = Math.max(0, ...vis.map((c) => c.order));
      const updated = currentLayout.map((c) =>
        c.card_id === cardId ? { ...c, visible: true, order: maxOrder + 1 } : c,
      );
      persist(updated);
    },
    [currentLayout, persist],
  );

  useReportHiddenBentoCards(tab, activeTabGlobal, hiddenCardSummaries, handleRestore);

  const handleResize = (cardId: string, size: CardSize) => {
    const updated = currentLayout.map((c) =>
      c.card_id === cardId ? { ...c, size } : c
    );
    persist(updated);
  };

  const visibleCardIds = visibleCards.map((c) => c.card_id);

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleCardIds} strategy={rectSortingStrategy}>
          <div className="finance-bento">
            {visibleCards.map((layout) => {
              const card = cards.find((c) => c.id === layout.card_id);
              if (!card) return null;
              return (
                <SortableCard
                  key={card.id}
                  card={card}
                  layout={layout}
                  onHide={() => handleHide(card.id)}
                  onResize={(s) => handleResize(card.id, s)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

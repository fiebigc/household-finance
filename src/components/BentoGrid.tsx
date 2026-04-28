import { useState, useCallback, type ReactNode } from "react";
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
import type { CardSize, CardLayoutEntry } from "@/types/schema";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

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
  const { user, cardLayouts, setCardLayout } = useAppStore();
  const backend = useBackend();
  const [showRestore, setShowRestore] = useState(false);

  const currentLayout = cardLayouts[tab] ?? cards.map((c, i) => ({
    card_id: c.id,
    size: c.defaultSize,
    order: i,
    visible: true,
  }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const persist = useCallback(
    (newLayout: CardLayoutEntry[]) => {
      setCardLayout(tab, newLayout);
      if (user) {
        backend.saveCardLayout({
          id: `${user.id}:${tab}`,
          user_id: user.id,
          tab,
          cards: newLayout,
          updated_at: new Date().toISOString(),
        }).catch(console.error);
      }
    },
    [tab, user, backend, setCardLayout]
  );

  const visibleCards = currentLayout
    .filter((l) => l.visible)
    .sort((a, b) => a.order - b.order);
  const hiddenCards = currentLayout.filter((l) => !l.visible);

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

  const handleRestore = (cardId: string) => {
    const maxOrder = Math.max(0, ...visibleCards.map((c) => c.order));
    const updated = currentLayout.map((c) =>
      c.card_id === cardId ? { ...c, visible: true, order: maxOrder + 1 } : c
    );
    persist(updated);
  };

  const handleResize = (cardId: string, size: CardSize) => {
    const updated = currentLayout.map((c) =>
      c.card_id === cardId ? { ...c, size } : c
    );
    persist(updated);
  };

  const visibleCardIds = visibleCards.map((c) => c.card_id);

  return (
    <div>
      {hiddenCards.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowRestore(!showRestore)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-card-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            {hiddenCards.length} hidden card{hiddenCards.length > 1 ? "s" : ""}
          </button>
          {showRestore && (
            <div className="mt-2 flex flex-wrap gap-2">
              {hiddenCards.map((h) => {
                const def = cards.find((c) => c.id === h.card_id);
                if (!def) return null;
                return (
                  <button
                    key={h.card_id}
                    onClick={() => handleRestore(h.card_id)}
                    className="px-3 py-1.5 text-xs rounded-bento-inner bg-muted/60 hover:bg-muted text-muted-foreground hover:text-card-foreground transition-colors"
                  >
                    + {def.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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

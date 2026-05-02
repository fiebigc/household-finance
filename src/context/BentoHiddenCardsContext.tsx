import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { TabId } from "@/stores/appStore";

export type HiddenBentoCardItem = { card_id: string; title: string };

export type BentoHiddenCardsRegistryState = {
  hidden: HiddenBentoCardItem[];
  restoreCard: ((cardId: string) => void) | null;
};

const BentoHiddenCardsContext = createContext<{
  registry: BentoHiddenCardsRegistryState;
  setRegistry: Dispatch<SetStateAction<BentoHiddenCardsRegistryState>>;
} | null>(null);

export function BentoHiddenCardsProvider({
  activeTab,
  children,
}: {
  activeTab: TabId;
  children: ReactNode;
}) {
  const [registry, setRegistry] = useState<BentoHiddenCardsRegistryState>({
    hidden: [],
    restoreCard: null,
  });

  useEffect(() => {
    setRegistry({ hidden: [], restoreCard: null });
  }, [activeTab]);

  const value = useMemo(() => ({ registry, setRegistry }), [registry]);

  return <BentoHiddenCardsContext.Provider value={value}>{children}</BentoHiddenCardsContext.Provider>;
}

export function useBentoHiddenCardsRegistry() {
  const ctx = useContext(BentoHiddenCardsContext);
  if (!ctx) throw new Error("BentoHiddenCardsProvider is required.");
  return ctx;
}

/** Publishes hidden card list + restore handler for the active tab (header hover menu). */
export function useReportHiddenBentoCards(
  tab: TabId,
  activeTab: TabId,
  hidden: HiddenBentoCardItem[],
  restoreCard: (cardId: string) => void,
) {
  const { setRegistry } = useBentoHiddenCardsRegistry();

  useEffect(() => {
    if (activeTab !== tab) return;
    setRegistry({ hidden, restoreCard });
    return () => {
      setRegistry({ hidden: [], restoreCard: null });
    };
  }, [tab, activeTab, hidden, restoreCard, setRegistry]);
}

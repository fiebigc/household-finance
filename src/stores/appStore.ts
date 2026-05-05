import { create } from "zustand";
import type { AppUser } from "@/types/appUser";
import type {
  Household, Entity, Account, Cashflow, Loan, Benefit, Period, CardLayoutEntry, Transaction,
} from "@/types/schema";
import { clearFileStorageSession } from "@/adapter/fileJson";

export type TabId = "overview" | "planning" | "data" | "expenses" | "retirement";

/** Where household finance rows are read/written. Auth still uses Supabase when configured. */
export type DataStorageMode = "supabase" | "file" | "demo";

const DATA_STORAGE_LS = "fin:data-storage-mode";

function readDataStorageMode(): DataStorageMode {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(DATA_STORAGE_LS) : null;
    if (v === "file" || v === "local") return "file";
  } catch {
    /* ignore */
  }
  return "file";
}

interface AppState {
  user: AppUser | null;
  setUser: (u: AppUser | null) => void;

  household: Household | null;
  setHousehold: (h: Household | null) => void;

  entities: Entity[];
  setEntities: (e: Entity[]) => void;

  accounts: Account[];
  setAccounts: (a: Account[]) => void;

  transactions: Transaction[];
  setTransactions: (t: Transaction[]) => void;

  cashflows: Cashflow[];
  setCashflows: (c: Cashflow[]) => void;

  loans: Loan[];
  setLoans: (l: Loan[]) => void;

  benefits: Benefit[];
  setBenefits: (b: Benefit[]) => void;

  periods: Period[];
  setPeriods: (p: Period[]) => void;

  activeTab: TabId;
  setActiveTab: (t: TabId) => void;

  cardLayouts: Record<string, CardLayoutEntry[]>;
  setCardLayout: (tab: string, cards: CardLayoutEntry[]) => void;

  loading: boolean;
  setLoading: (l: boolean) => void;

  _refresh: (() => Promise<void>) | null;
  setRefreshFn: (fn: () => Promise<void>) => void;
  refresh: () => Promise<void>;

  clearFinanceData: () => void;

  dataStorageMode: DataStorageMode;
  setDataStorageMode: (m: DataStorageMode) => void;

  fileStorageFolderName: string | null;
  setFileStorageFolderName: (n: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),

  household: null,
  setHousehold: (household) => set({ household }),

  entities: [],
  setEntities: (entities) => set({ entities }),

  accounts: [],
  setAccounts: (accounts) => set({ accounts }),

  transactions: [],
  setTransactions: (transactions: Transaction[]) => set({ transactions }),

  cashflows: [],
  setCashflows: (cashflows) => set({ cashflows }),

  loans: [],
  setLoans: (loans) => set({ loans }),

  benefits: [],
  setBenefits: (benefits) => set({ benefits }),

  periods: [],
  setPeriods: (periods) => set({ periods }),

  activeTab: "overview",
  setActiveTab: (activeTab) => set({ activeTab }),

  cardLayouts: {},
  setCardLayout: (tab, cards) =>
    set((s) => ({ cardLayouts: { ...s.cardLayouts, [tab]: cards } })),

  loading: true,
  setLoading: (loading) => set({ loading }),

  _refresh: null,
  setRefreshFn: (fn) => set({ _refresh: fn }),
  refresh: async () => {
    const fn = get()._refresh;
    if (fn) await fn();
  },

  clearFinanceData: () =>
    set({
      household: null,
      entities: [],
      accounts: [],
      transactions: [],
      cashflows: [],
      loans: [],
      benefits: [],
      periods: [],
      cardLayouts: {},
      loading: true,
    }),

  dataStorageMode: readDataStorageMode(),
  setDataStorageMode: (dataStorageMode) => {
    try {
      if (typeof localStorage !== "undefined") {
        if (dataStorageMode === "file") localStorage.setItem(DATA_STORAGE_LS, "file");
        else if (dataStorageMode === "supabase") localStorage.removeItem(DATA_STORAGE_LS);
      }
    } catch {
      /* ignore */
    }
    if (dataStorageMode === "supabase") {
      clearFileStorageSession();
      set({ dataStorageMode, fileStorageFolderName: null });
    } else {
      set({ dataStorageMode });
    }
  },

  fileStorageFolderName: null,
  setFileStorageFolderName: (fileStorageFolderName) => set({ fileStorageFolderName }),
}));

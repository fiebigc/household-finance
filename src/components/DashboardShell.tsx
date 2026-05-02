import { useAppStore, type TabId } from "@/stores/appStore";
import { useFinanceData } from "@/hooks/useFinanceData";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { lockLocalVaultForSignOut } from "@/adapter/fileJson";
import {
  LayoutDashboard, CalendarDays, Database, Receipt, PiggyBank,
  LogOut, RefreshCw, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewPage } from "@/pages/OverviewPage";
import { PlanningPage } from "@/pages/PlanningPage";
import { DataSettingsPage } from "@/pages/DataSettingsPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { RetirementPage } from "@/pages/RetirementPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { useState, type ComponentType } from "react";
import {
  BentoHiddenCardsProvider,
  useBentoHiddenCardsRegistry,
} from "@/context/BentoHiddenCardsContext";

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "planning", label: "Planning", icon: CalendarDays },
  { id: "data", label: "Data & Settings", icon: Database },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "retirement", label: "Retirement", icon: PiggyBank },
];

const pageMap: Record<TabId, ComponentType> = {
  overview: OverviewPage,
  planning: PlanningPage,
  data: DataSettingsPage,
  expenses: ExpensesPage,
  retirement: RetirementPage,
};

function TabBarWithHiddenCards({
  activeTab,
  setActiveTab,
}: {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
}) {
  const { registry } = useBentoHiddenCardsRegistry();

  return (
    <nav className="sticky top-[56px] z-30 flex justify-center px-4 py-2">
      <div
        className={cn(
          "flex flex-wrap justify-center gap-0.5 rounded-full border border-border/50",
          "bg-card/25 backdrop-blur-xl shadow-bento p-1",
          "max-w-full",
        )}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const hiddenCount = isActive ? registry.hidden.length : 0;

          return (
            <div key={tab.id} className="relative flex items-center group/tab-hidden">
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive
                    ? "bg-card/75 text-card-foreground shadow-sm backdrop-blur-md"
                    : "text-muted-foreground hover:text-card-foreground hover:bg-muted/25",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && hiddenCount > 0 && (
                  <span
                    className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-primary"
                    aria-hidden
                  >
                    {hiddenCount}
                  </span>
                )}
              </button>

              {isActive && hiddenCount > 0 && (
                <div
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-[calc(100%-6px)] z-50 w-max min-w-[12rem] max-w-[min(90vw,18rem)] -translate-x-1/2",
                    "px-2 pt-3 opacity-0 transition-opacity duration-150",
                    "group-hover/tab-hidden:pointer-events-auto group-hover/tab-hidden:opacity-100",
                    "group-focus-within/tab-hidden:pointer-events-auto group-focus-within/tab-hidden:opacity-100",
                  )}
                  role="presentation"
                >
                  <div
                    role="menu"
                    aria-label="Hidden dashboard cards"
                    className="rounded-xl border border-border/80 bg-popover/95 p-2 text-left shadow-lg backdrop-blur-md"
                  >
                    <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {hiddenCount} hidden card{hiddenCount !== 1 ? "s" : ""}
                    </p>
                    <ul className="flex max-h-[min(70vh,20rem)] flex-col gap-0.5 overflow-y-auto">
                      {registry.hidden.map((h) => (
                        <li key={h.card_id}>
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
                            onClick={() => registry.restoreCard?.(h.card_id)}
                          >
                            Show "{h.title}"
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardShellInner() {
  const {
    activeTab,
    setActiveTab,
    user,
    loading,
    entities,
    refresh,
    dataStorageMode,
    clearFinanceData,
    setUser,
  } = useAppStore();
  useFinanceData();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const PageComponent = pageMap[activeTab];

  const currentEntity = entities.find(
    (e) => e.type === "adult" && e.metadata?.auth_user_id === user?.id,
  );
  const displayName = currentEntity?.name ?? user?.email?.split("@")[0] ?? "User";

  const handleSignOut = async () => {
    clearFinanceData();
    setUser(null);
    if (dataStorageMode === "supabase") {
      if (isSupabaseConfigured() && supabase) await supabase.auth.signOut();
    } else {
      lockLocalVaultForSignOut();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex justify-center px-4 pt-3 pb-0">
        <div className="flex items-center justify-between gap-4 w-full max-w-3xl h-11 px-5 bg-card/90 backdrop-blur-xl rounded-full shadow-bento border border-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold tracking-tight truncate">Finance</span>
            <span className="hidden sm:inline text-xs text-muted-foreground truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors"
              title="Account & household settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="p-1.5 rounded-full text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <AccountSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <TabBarWithHiddenCards activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="page-shell">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading household data...</p>
            </div>
          </div>
        ) : (
          <ErrorBoundary>
            <PageComponent />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

export function DashboardShell() {
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <BentoHiddenCardsProvider activeTab={activeTab}>
      <DashboardShellInner />
    </BentoHiddenCardsProvider>
  );
}

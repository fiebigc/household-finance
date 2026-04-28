import { useAppStore, type TabId } from "@/stores/appStore";
import { useFinanceData } from "@/hooks/useFinanceData";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, CalendarDays, Database, Receipt, PiggyBank,
  LogOut, RefreshCw, Eye, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewPage } from "@/pages/OverviewPage";
import { PlanningPage } from "@/pages/PlanningPage";
import { DataSettingsPage } from "@/pages/DataSettingsPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { RetirementPage } from "@/pages/RetirementPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { useState } from "react";

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "planning", label: "Planning", icon: CalendarDays },
  { id: "data", label: "Data & Settings", icon: Database },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "retirement", label: "Retirement", icon: PiggyBank },
];

const pageMap: Record<TabId, React.ComponentType> = {
  overview: OverviewPage,
  planning: PlanningPage,
  data: DataSettingsPage,
  expenses: ExpensesPage,
  retirement: RetirementPage,
};

export function DashboardShell() {
  const { activeTab, setActiveTab, user, loading, entities, refresh } = useAppStore();
  useFinanceData();
  const [showHiddenCards, setShowHiddenCards] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const PageComponent = pageMap[activeTab];

  const currentEntity = entities.find(
    (e) => e.type === "adult" && e.metadata?.auth_user_id === user?.id
  );
  const displayName = currentEntity?.name ?? user?.email?.split("@")[0] ?? "User";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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
      {/* Sticky pill header */}
      <header className="sticky top-0 z-40 flex justify-center px-4 pt-3 pb-0">
        <div className="flex items-center justify-between gap-4 w-full max-w-3xl h-11 px-5 bg-card/90 backdrop-blur-xl rounded-full shadow-bento border border-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold tracking-tight truncate">Finance</span>
            <span className="hidden sm:inline text-xs text-muted-foreground truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHiddenCards(!showHiddenCards)}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                showHiddenCards ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-card-foreground"
              )}
              title="Manage hidden cards"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors"
              title="Account & household settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            </button>
            <button
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

      {/* Tab bar — transparent glass pill */}
      <nav className="sticky top-[56px] z-30 flex justify-center px-4 py-2">
        <div
          className={cn(
            "flex flex-wrap justify-center gap-0.5 rounded-full border border-border/50",
            "bg-card/25 backdrop-blur-xl shadow-bento p-1",
            "max-w-full"
          )}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all",
                  isActive
                    ? "bg-card/75 text-card-foreground shadow-sm backdrop-blur-md"
                    : "text-muted-foreground hover:text-card-foreground hover:bg-muted/25"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Page content */}
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

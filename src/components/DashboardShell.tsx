import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type TabId } from "@/stores/appStore";
import { useFinanceData } from "@/hooks/useFinanceData";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { lockLocalVaultForSignOut } from "@/adapter/fileJson";
import { clearMockAdapterStores } from "@/adapter/mock";
import {
  LayoutDashboard,
  CalendarDays,
  Database,
  Receipt,
  PiggyBank,
  LogOut,
  RefreshCw,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewPage } from "@/pages/OverviewPage";
import { PlanningPage } from "@/pages/PlanningPage";
import { DataSettingsPage } from "@/pages/DataSettingsPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { RetirementPage } from "@/pages/RetirementPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountSettingsModal } from "./AccountSettingsModal";
import {
  BentoHiddenCardsProvider,
  useBentoHiddenCardsRegistry,
} from "@/context/BentoHiddenCardsContext";
import { getIsTauri } from "@/utils/tauriDetection";
import { queueSyncDesktopAppMenu } from "@/lib/desktopAppMenu";

const tabs: { id: TabId; icon: typeof LayoutDashboard }[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "planning", icon: CalendarDays },
  { id: "data", icon: Database },
  { id: "expenses", icon: Receipt },
  { id: "retirement", icon: PiggyBank },
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
  const { t } = useTranslation();
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
                <span className="hidden sm:inline">{t(`nav.${tab.id}`)}</span>
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
                    aria-label={t("shell.hidden_cards_menu")}
                    className="rounded-xl border border-border/80 bg-popover/95 p-2 text-left shadow-lg backdrop-blur-md"
                  >
                    <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {hiddenCount === 1 ? t("shell.hidden_cards_one") : t("shell.hidden_cards_more", { count: hiddenCount })}
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
                            {t("shell.show_card", { title: h.title })}
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

function DesktopSidebar({
  activeTab,
  setActiveTab,
  displayName,
  demoMode,
}: {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  displayName: string;
  demoMode: boolean;
}) {
  const { t } = useTranslation();
  const { registry } = useBentoHiddenCardsRegistry();

  return (
    <aside className="shrink-0 flex flex-col w-[238px] border-r border-border/50 bg-card/35 backdrop-blur-xl">
      <div className="px-4 pt-5 pb-3 border-b border-border/40">
        <div className="text-sm font-semibold tracking-tight leading-tight truncate">{t("shell.app_short_name")}</div>
        <div className="text-[11px] text-muted-foreground truncate mt-1" title={displayName}>
          {displayName}
        </div>
        {demoMode && (
          <div className="mt-2 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-[10px] font-medium text-amber-950 dark:text-amber-100 text-center">
            {t("shell.demo_mode_badge")}
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label={t("shell.native_menu_view")}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "bg-card/85 text-card-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-card-foreground",
              )}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-85" aria-hidden />
              <span className="truncate">{t(`nav.${tab.id}`)}</span>
              {isActive && registry.hidden.length > 0 && (
                <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-primary shrink-0">
                  {registry.hidden.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {registry.hidden.length > 0 && (
        <div className="shrink-0 border-t border-border/40 px-3 py-3 space-y-1.5 bg-muted/15">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {t("shell.hidden_cards_menu")}
          </p>
          <ul className="max-h-[40vh] overflow-y-auto space-y-0.5" role="list">
            {registry.hidden.map((h) => (
              <li key={h.card_id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-card-foreground transition-colors"
                  onClick={() => registry.restoreCard?.(h.card_id)}
                >
                  {t("shell.show_card", { title: h.title })}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground/90 px-1 leading-snug">{t("shell.desktop_menu_hint_cards")}</p>
        </div>
      )}
    </aside>
  );
}

function DashboardShellInner() {
  const [isDesktopApp] = useState(() => getIsTauri());
  const { t, i18n } = useTranslation();
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
    setDataStorageMode,
  } = useAppStore();
  useFinanceData();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { registry } = useBentoHiddenCardsRegistry();

  const PageComponent = pageMap[activeTab];

  const hiddenMenuKey = registry.hidden.map((h) => `${h.card_id}\t${h.title}`).join("\n");

  const currentEntity = entities.find(
    (e) => e.type === "adult" && e.metadata?.auth_user_id === user?.id,
  );
  const displayName = currentEntity?.name ?? user?.email?.split("@")[0] ?? "User";

  const handleSignOut = useCallback(async () => {
    if (dataStorageMode === "demo") {
      clearMockAdapterStores();
      clearFinanceData();
      setUser(null);
      setDataStorageMode("file");
      return;
    }
    clearFinanceData();
    setUser(null);
    if (dataStorageMode === "supabase") {
      if (isSupabaseConfigured() && supabase) await supabase.auth.signOut();
    } else {
      lockLocalVaultForSignOut();
    }
  }, [clearFinanceData, dataStorageMode, setDataStorageMode, setUser]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  useEffect(() => {
    if (!isDesktopApp) return;
    queueSyncDesktopAppMenu({
      t,
      appDisplayName: t("shell.app_short_name"),
      hiddenCards: registry.hidden,
      onNavigate: setActiveTab,
      onOpenSettings: openSettings,
      onRefresh: () => void handleRefresh(),
      onLogout: () => void handleSignOut(),
      onRestoreCard: (cardId) => registry.restoreCard?.(cardId),
    });
  }, [
    handleRefresh,
    handleSignOut,
    hiddenMenuKey,
    i18n.language,
    isDesktopApp,
    openSettings,
    registry.restoreCard,
    setActiveTab,
    t,
  ]);

  return (
    <div className={cn("min-h-screen bg-canvas", isDesktopApp && "flex")}>
      {isDesktopApp ? (
        <DesktopSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          displayName={displayName}
          demoMode={dataStorageMode === "demo"}
        />
      ) : (
        <>
          <header className="sticky top-0 z-40 flex justify-center px-4 pt-3 pb-0">
            <div className="flex items-center justify-between gap-4 w-full max-w-3xl h-11 px-5 bg-card/90 backdrop-blur-xl rounded-full shadow-bento border border-border/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm font-semibold tracking-tight truncate">{t("shell.app_short_name")}</span>
                <span className="hidden sm:inline text-xs text-muted-foreground truncate">{displayName}</span>
                {dataStorageMode === "demo" && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/35 px-2 py-0.5 text-[10px] font-semibold text-amber-950 dark:text-amber-100 shrink-0">
                    {t("shell.demo_mode_badge")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={openSettings}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors"
                  title={t("shell.account_settings_title")}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
                  title={t("shell.refresh")}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="p-1.5 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                  title={t("shell.logout")}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </header>
          <TabBarWithHiddenCards activeTab={activeTab} setActiveTab={setActiveTab} />
        </>
      )}

      <AccountSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <main className={cn(isDesktopApp ? "flex flex-1 flex-col min-h-0 min-w-0" : "page-shell")}>
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">{t("shell.loading_household")}</p>
            </div>
          </div>
        ) : (
          <ErrorBoundary>
            <div className={cn(isDesktopApp ? "flex-1 overflow-auto page-shell" : "")}>
              <PageComponent />
            </div>
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

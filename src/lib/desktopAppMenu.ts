import type { TFunction } from "i18next";
import type { TabId } from "@/stores/appStore";

export type DesktopMenuHiddenCard = { card_id: string; title: string };

export type SyncDesktopAppMenuOptions = {
  t: TFunction;
  appDisplayName: string;
  hiddenCards: DesktopMenuHiddenCard[];
  onNavigate: (tab: TabId) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  onRestoreCard: (cardId: string) => void;
};

const TAB_IDS: TabId[] = ["overview", "planning", "data", "expenses", "retirement"];

let menuQueue = Promise.resolve();

async function buildAndSetMenu(opts: SyncDesktopAppMenuOptions): Promise<void> {
  const { Menu, Submenu, MenuItem, PredefinedMenuItem } = await import("@tauri-apps/api/menu");

  const tabNavItems = await Promise.all(
    TAB_IDS.map((id, idx) =>
      MenuItem.new({
        id: `nav-${id}`,
        text: opts.t(`nav.${id}`),
        accelerator: `CmdOrCtrl+${idx + 1}`,
        action: () => opts.onNavigate(id),
      }),
    ),
  );

  const viewSubmenu = await Submenu.new({
    id: "submenu-view",
    text: opts.t("shell.native_menu_view"),
    items: [
      ...tabNavItems,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Fullscreen" }),
    ],
  });

  const accountSubmenu = await Submenu.new({
    id: "submenu-account",
    text: opts.t("shell.native_menu_account"),
    items: [
      await MenuItem.new({
        id: "menu-account-settings",
        text: opts.t("shell.account_settings_menu"),
        accelerator: "CmdOrCtrl+,",
        action: (_id: string) => opts.onOpenSettings(),
      }),
      await MenuItem.new({
        id: "menu-refresh",
        text: opts.t("shell.refresh"),
        accelerator: "CmdOrCtrl+R",
        action: (_id: string) => opts.onRefresh(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "menu-logout",
        text: opts.t("shell.logout"),
        action: (_id: string) => opts.onLogout(),
      }),
    ],
  });

  const dashboardChildren =
    opts.hiddenCards.length === 0
      ? [
          await MenuItem.new({
            id: "dash-no-hidden",
            text: opts.t("shell.menu_no_hidden_dashboard_cards"),
            enabled: false,
          }),
        ]
      : await Promise.all(
          opts.hiddenCards.map((h, i) =>
            MenuItem.new({
              id: `restore-dash-${i}-${encodeURIComponent(h.card_id)}`,
              text: opts.t("shell.show_card", { title: h.title }),
              action: (_id: string) => opts.onRestoreCard(h.card_id),
            }),
          ),
        );

  const dashboardSubmenu = await Submenu.new({
    id: "submenu-dashboard",
    text: opts.t("shell.native_menu_dashboard"),
    items: dashboardChildren,
  });

  const appSubmenu = await Submenu.new({
    id: "submenu-app",
    text: opts.appDisplayName,
    items: [
      await PredefinedMenuItem.new({
        item: { About: { name: opts.appDisplayName } },
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Quit" }),
    ],
  });

  const menu = await Menu.new({
    items: [appSubmenu, viewSubmenu, accountSubmenu, dashboardSubmenu],
  });

  await menu.setAsAppMenu();
}

export function queueSyncDesktopAppMenu(opts: SyncDesktopAppMenuOptions): void {
  menuQueue = menuQueue
    .then(() => buildAndSetMenu(opts))
    .catch((e) => console.warn("[desktopAppMenu]", e));
}

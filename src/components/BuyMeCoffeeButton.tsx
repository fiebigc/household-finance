import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getIsTauri } from "@/utils/tauriDetection";
import { cn } from "@/lib/utils";

export const BUY_ME_COFFEE_HREF = "https://buymeacoffee.com/fiebigcx";

async function openBuyMeCoffeePage(): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(BUY_ME_COFFEE_HREF);
  } catch {
    window.open(BUY_ME_COFFEE_HREF, "_blank", "noopener,noreferrer");
  }
}

const linkClass =
  "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-2";

/** Plain text link — reliable in settings / anywhere the BMC widget script may not load. */
export function BuyMeCoffeeLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [isTauri] = useState(() => getIsTauri());

  if (isTauri) {
    return (
      <button type="button" onClick={() => void openBuyMeCoffeePage()} className={cn(linkClass, className)}>
        {t("settings.bmc_button_text")}
      </button>
    );
  }

  return (
    <a
      href={BUY_ME_COFFEE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(linkClass, className)}
    >
      {t("settings.bmc_button_text")}
    </a>
  );
}

/**
 * Web: official Buy Me a Coffee widget (remote script).
 * Desktop (Tauri): external scripts are unreliable in the webview — use a themed button + opener (system browser).
 */
export function BuyMeCoffeeButton({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const [isTauri] = useState(() => getIsTauri());
  const hostRef = useRef<HTMLDivElement>(null);

  const openBmc = useCallback(() => openBuyMeCoffeePage(), []);

  useEffect(() => {
    if (isTauri) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js";
    script.async = true;
    script.dataset.name = "bmc-button";
    script.dataset.slug = "fiebigcx";
    script.dataset.color = "#000000";
    script.dataset.emoji = "☕";
    script.dataset.font = "Lato";
    script.dataset.text = t("settings.bmc_button_text");
    script.dataset.outlineColor = "#ffffff";
    script.dataset.fontColor = "#ffffff";
    script.dataset.coffeeColor = "#FFDD00";
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
    };
  }, [isTauri, t, i18n.language]);

  if (isTauri) {
    return (
      <button
        type="button"
        onClick={() => void openBmc()}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-opacity",
          "bg-[#FFDD00] text-black hover:opacity-90 border border-black/10",
          className,
        )}
      >
        <span aria-hidden>☕</span>
        {t("settings.bmc_button_text")}
      </button>
    );
  }

  return <div ref={hostRef} className={className} />;
}

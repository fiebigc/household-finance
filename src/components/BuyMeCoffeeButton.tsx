import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getIsTauri } from "@/utils/tauriDetection";
import { cn } from "@/lib/utils";

/** Full BMC profile URL, or omit and set `VITE_BUY_ME_A_COFFEE_SLUG` only. */
function buyMeCoffeeHref(): string | null {
  const url = import.meta.env.VITE_BUY_ME_A_COFFEE_URL?.trim();
  if (url) return url;
  const slug = import.meta.env.VITE_BUY_ME_A_COFFEE_SLUG?.trim();
  if (slug) return `https://buymeacoffee.com/${slug}`;
  return null;
}

function buyMeCoffeeSlug(): string | null {
  return import.meta.env.VITE_BUY_ME_A_COFFEE_SLUG?.trim() || null;
}

async function openBuyMeCoffeePage(href: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

const linkClass =
  "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-2";

/** Plain text link — reliable in settings / anywhere the BMC widget script may not load. */
export function BuyMeCoffeeLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [isTauri] = useState(() => getIsTauri());
  const href = buyMeCoffeeHref();

  if (!href) return null;

  if (isTauri) {
    return (
      <button type="button" onClick={() => void openBuyMeCoffeePage(href)} className={cn(linkClass, className)}>
        {t("settings.bmc_button_text")}
      </button>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, className)}>
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
  const href = buyMeCoffeeHref();
  const slug = buyMeCoffeeSlug();

  const openBmc = useCallback(() => {
    if (href) void openBuyMeCoffeePage(href);
  }, [href]);

  useEffect(() => {
    if (isTauri || !slug) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js";
    script.async = true;
    script.dataset.name = "bmc-button";
    script.dataset.slug = slug;
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
  }, [isTauri, slug, t, i18n.language]);

  if (!href) return null;

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

  if (slug) {
    return <div ref={hostRef} className={className} />;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, className)}>
      {t("settings.bmc_button_text")}
    </a>
  );
}

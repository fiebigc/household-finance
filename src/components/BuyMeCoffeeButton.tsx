import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Loads the official Buy Me a Coffee widget script once (used in settings / about).
 */
export function BuyMeCoffeeButton({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, [t, i18n.language]);

  return <div ref={hostRef} className={className} />;
}

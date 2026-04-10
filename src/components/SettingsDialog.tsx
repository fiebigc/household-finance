import { Settings } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Locale } from "@/i18n/I18nContext";
import { useI18n } from "@/i18n/I18nContext";
import type { Theme } from "@/theme/ThemeContext";
import { useTheme } from "@/theme/ThemeContext";
import { SGI_CEILING } from "@/lib/swedishBenefits2026";

type Props = {
  startingBalanceSek: number;
  onStartingBalanceChange: (v: number) => void;
  sgiAnnual: number;
  onSgiChange: (v: number) => void;
  fullTimeGross: number;
  onFullTimeGrossChange: (v: number) => void;
};

export function SettingsDialog({
  startingBalanceSek, onStartingBalanceChange,
  sgiAnnual, onSgiChange,
  fullTimeGross, onFullTimeGrossChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const { t, locale, setLocale, numberLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" type="button">
          <Settings className="h-4 w-4" />
          {t("settings.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>
            {user ? `${t("settings.signedInAs")} ${user.displayName} (${user.email})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>{t("settings.language")}</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="fi">Suomi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("settings.theme")}</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t("settings.themeLight")}</SelectItem>
                <SelectItem value="dark">{t("settings.themeDark")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-medium">{t("settings.incomeSection")}</Label>
              <InfoTip text={t("settings.incomeSectionTip")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("settings.sgiLabel")}</Label>
              <Input
                inputMode="numeric"
                value={sgiAnnual || ""}
                onChange={(e) => onSgiChange(Math.min(SGI_CEILING, Number(e.target.value.replace(/\s/g, "")) || 0))}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("settings.sgiHint", { ceiling: fmt(SGI_CEILING) })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("settings.fullTimeGrossLabel")}</Label>
              <Input
                inputMode="numeric"
                value={fullTimeGross || ""}
                onChange={(e) => onFullTimeGrossChange(Number(e.target.value.replace(/\s/g, "")) || 0)}
              />
              <p className="text-[10px] text-muted-foreground">{t("settings.fullTimeGrossHint")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("household.startingBalance", { currency: t("common.currency") })}</Label>
            <Input
              inputMode="numeric"
              value={startingBalanceSek || ""}
              onChange={(e) => onStartingBalanceChange(Number(e.target.value.replace(/\s/g, "")) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">{t("household.taxCardTip")}</p>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              void logout();
              setOpen(false);
            }}
          >
            {t("settings.logout")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

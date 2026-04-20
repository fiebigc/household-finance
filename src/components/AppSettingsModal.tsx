import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BENTO_CARD_SURFACE_IDS,
  BENTO_CARD_SURFACE_LABELS,
  BENTO_CARD_SURFACE_THEMES,
  BENTO_SURFACE_PRESET_LABELS,
  type BentoCardSurfaceId,
  type BentoCardSurfaceTheme,
  type BentoSurfacePresetId,
} from "@/config/bentoCardSurfaces";
import type { HouseholdConfig } from "@/config/householdConfig";
import type { BankAccountRecord, EntityRecord } from "@/data/bankData";
import { BankCsvImportCard } from "@/components/BankCsvImportCard";
import { MacosSwitch } from "@/components/MacosSwitch";
import { TinkConnectCard } from "@/components/TinkConnectCard";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
  householdDraft: HouseholdConfig;
  setHouseholdDraft: Dispatch<SetStateAction<HouseholdConfig>>;
  showIndividualAccounts: boolean;
  setShowIndividualAccounts: (v: boolean) => void;
  userId: string | undefined;
  /** Shown read-only; comes from the signed-in Supabase session. */
  userEmail?: string | null;
  accounts: BankAccountRecord[];
  entities: EntityRecord[];
  onLinkBankAccountToEntity: (accountId: string, entityId: string) => Promise<void>;
  onBankImportComplete?: () => void;
  bentoSurfaceMap: Record<BentoCardSurfaceId, BentoCardSurfaceTheme>;
  onBentoSurfaceChange: (id: BentoCardSurfaceId, theme: BentoCardSurfaceTheme) => void;
  onBentoApplyPreset: (presetId: BentoSurfacePresetId) => void;
  onBentoResetDefaultMix: () => void;
}

export function AppSettingsModal({
  open,
  onClose,
  householdDraft,
  setHouseholdDraft,
  showIndividualAccounts,
  setShowIndividualAccounts,
  userId,
  userEmail,
  accounts,
  entities,
  onLinkBankAccountToEntity,
  onBankImportComplete,
  bentoSurfaceMap,
  onBentoSurfaceChange,
  onBentoApplyPreset,
  onBentoResetDefaultMix,
}: Props) {
  const [presetMenu, setPresetMenu] = useState("");

  useEffect(() => {
    if (open) setPresetMenu("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-mac"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <h2 id="settings-modal-title" className="text-base font-semibold tracking-tight">
            Settings
          </h2>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onClose}>
            Done
          </Button>
        </div>
        <div className="overflow-y-auto p-4">
          <Card className="border-0 shadow-none">
            <CardHeader className="p-0 pb-3">
              <CardTitle>Household</CardTitle>
              <CardDescription>
                Transition date and chart defaults for this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div className="space-y-1">
                <Label htmlFor="settings-transition">Transition date (default)</Label>
                <Input
                  id="settings-transition"
                  type="date"
                  value={householdDraft.transitionDate}
                  onChange={(e) =>
                    setHouseholdDraft((prev) => ({
                      ...prev,
                      transitionDate: e.target.value,
                    }))
                  }
                />
              </div>
              <MacosSwitch
                id="settings-show-accounts"
                checked={showIndividualAccounts}
                onCheckedChange={setShowIndividualAccounts}
                label="Show individual accounts on trend chart"
              />
              <div className="space-y-1">
                <Label htmlFor="settings-session-email">Signed-in account</Label>
                <Textarea
                  id="settings-session-email"
                  value={userEmail?.trim() ?? ""}
                  readOnly
                  placeholder="No email on this session"
                  className="min-h-[52px] resize-none text-xs"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <details className="group mt-4 rounded-2xl border border-border/60 bg-card text-card-foreground shadow-none open:shadow-sm dark:border-border/80 dark:bg-card/85">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-muted/25 [&::-webkit-details-marker]:hidden">
              <span>Appearance</span>
              <span className="text-xs font-normal text-muted-foreground">
                <span className="group-open:hidden">Show</span>
                <span className="hidden group-open:inline">Hide</span>
              </span>
            </summary>
            <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3">
              <p className="text-sm text-muted-foreground">
                Mix light, dark, and tinted surfaces per tile (like a bento board). Saved on this
                device.
              </p>
              <div className="space-y-1">
                <Label htmlFor="bento-preset">Preset</Label>
                <select
                  id="bento-preset"
                  className="native-select mt-0"
                  aria-label="Apply dashboard card preset"
                  value={presetMenu}
                  onChange={(e) => {
                    const v = e.target.value as BentoSurfacePresetId | "";
                    setPresetMenu("");
                    if (!v) return;
                    onBentoApplyPreset(v);
                  }}
                >
                  <option value="">Apply a preset…</option>
                  {(Object.keys(BENTO_SURFACE_PRESET_LABELS) as BentoSurfacePresetId[]).map(
                    (id) => (
                      <option key={id} value={id}>
                        {BENTO_SURFACE_PRESET_LABELS[id]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={onBentoResetDefaultMix}>
                Reset to default mix
              </Button>
              <div className="max-h-[min(40vh,280px)] space-y-2 overflow-y-auto pr-1">
                {BENTO_CARD_SURFACE_IDS.map((id) => (
                  <div key={id} className="space-y-1">
                    <Label className="text-sm leading-snug" htmlFor={`bento-${id}`}>
                      {BENTO_CARD_SURFACE_LABELS[id]}
                    </Label>
                    <select
                      id={`bento-${id}`}
                      className="native-select mt-0 text-sm"
                      value={bentoSurfaceMap[id] ?? "light"}
                      onChange={(e) =>
                        onBentoSurfaceChange(id, e.target.value as BentoCardSurfaceTheme)
                      }
                    >
                      {BENTO_CARD_SURFACE_THEMES.map((t) => (
                        <option key={t} value={t}>
                          {t === "light"
                            ? "Light (inherit)"
                            : t === "dark"
                              ? "Dark"
                              : t === "slate"
                                ? "Slate tint"
                                : t === "ocean"
                                  ? "Ocean tint"
                                  : "Rose tint"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <div className="mt-4">
            <BankCsvImportCard
              householdId={userId ?? ""}
              accounts={accounts}
              entities={entities}
              onLinkBankAccountToEntity={onLinkBankAccountToEntity}
              onImportComplete={onBankImportComplete}
              cardClassName="w-full border border-border/60 bg-card shadow-none"
            />
          </div>

          <div className="mt-4">
            <TinkConnectCard
              userId={userId}
              cardClassName="w-full border border-border/60 bg-card shadow-none"
            />
          </div>

          <Card className="mt-4 border-0 shadow-none">
            <CardHeader className="p-0 pb-3">
              <CardTitle>Session</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  if (supabase) await supabase.auth.signOut();
                  onClose();
                }}
              >
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

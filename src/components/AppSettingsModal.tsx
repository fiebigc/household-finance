import type { Dispatch, SetStateAction } from "react";
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
import type { HouseholdConfig } from "@/config/householdConfig";
import type { BankAccountRecord } from "@/data/bankData";
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
  accounts: BankAccountRecord[];
  onBankImportComplete?: () => void;
}

export function AppSettingsModal({
  open,
  onClose,
  householdDraft,
  setHouseholdDraft,
  showIndividualAccounts,
  setShowIndividualAccounts,
  userId,
  accounts,
  onBankImportComplete,
}: Props) {
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
              <CardTitle className="text-sm">Household</CardTitle>
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
                <Label htmlFor="settings-emails">Connected emails</Label>
                <Textarea
                  id="settings-emails"
                  value={"heli.vauhkala@gmail.com\nfiebigc@gmail.com"}
                  readOnly
                  className="min-h-[72px]"
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-4">
            <BankCsvImportCard
              accounts={accounts}
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
              <CardTitle className="text-sm">Session</CardTitle>
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

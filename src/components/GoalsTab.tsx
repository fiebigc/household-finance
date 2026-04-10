import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";

type Goal = {
  id: string;
  name: string;
  targetSek: number;
  savedSek: number;
  deadline: string;
};

const STORAGE_KEY = "finance-goals";

function loadGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

function persistGoals(goals: Goal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export function GoalsTab() {
  const { t, numberLocale } = useI18n();
  const [goals, setGoals] = useState<Goal[]>(loadGoals);

  const update = (next: Goal[]) => {
    setGoals(next);
    persistGoals(next);
  };

  const addGoal = () => {
    update([
      ...goals,
      { id: crypto.randomUUID(), name: "", targetSek: 0, savedSek: 0, deadline: "" },
    ]);
  };

  const removeGoal = (id: string) => update(goals.filter((g) => g.id !== id));

  const patch = (id: string, patch: Partial<Goal>) =>
    update(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 pb-3">
        <CardTitle className="text-base">{t("goals.title")}</CardTitle>
        <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={addGoal}>
          <Plus className="h-3.5 w-3.5" /> {t("goals.add")}
        </Button>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("goals.empty")}</p>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => {
              const pct = g.targetSek > 0 ? Math.min(100, (g.savedSek / g.targetSek) * 100) : 0;
              return (
                <div key={g.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Input
                      className="h-8 min-w-[120px] flex-1"
                      placeholder={t("goals.namePlaceholder")}
                      value={g.name}
                      onChange={(e) => patch(g.id, { name: e.target.value })}
                    />
                    <Input
                      className="h-8 w-28"
                      type="number"
                      placeholder={t("goals.target")}
                      value={g.targetSek || ""}
                      onChange={(e) => patch(g.id, { targetSek: Number(e.target.value) || 0 })}
                    />
                    <Input
                      className="h-8 w-28"
                      type="number"
                      placeholder={t("goals.saved")}
                      value={g.savedSek || ""}
                      onChange={(e) => patch(g.id, { savedSek: Number(e.target.value) || 0 })}
                    />
                    <Input
                      className="h-8 w-36"
                      type="date"
                      value={g.deadline}
                      onChange={(e) => patch(g.id, { deadline: e.target.value })}
                    />
                    <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => removeGoal(g.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                      {fmt(g.savedSek)} / {fmt(g.targetSek)}
                    </span>
                    <span className="w-12 text-right text-xs font-medium tabular-nums">
                      {Math.round(pct)}%
                    </span>
                  </div>
                  {g.deadline && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("goals.deadlineLabel")}: {g.deadline}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

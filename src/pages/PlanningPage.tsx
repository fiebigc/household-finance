import { useState } from "react";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import {
  CalendarDays, Baby, Briefcase, Clock, Umbrella,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday,
} from "date-fns";

function CalendarCardContent() {
  const { entities, periods } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEntity, setSelectedEntity] = useState<string | "all">("all");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = (getDay(monthStart) + 6) % 7;

  const activePeriods = periods.filter(p => {
    if (selectedEntity !== "all" && p.entity_id !== selectedEntity) return false;
    const from = new Date(p.date_from);
    const to = p.date_to ? new Date(p.date_to) : new Date("2099-12-31");
    return from <= monthEnd && to >= monthStart;
  });

  const periodTypeColors: Record<string, string> = {
    employed: "bg-blue-100 text-blue-700",
    self_employed: "bg-indigo-100 text-indigo-700",
    parental_leave: "bg-pink-100 text-pink-700",
    unemployed: "bg-orange-100 text-orange-700",
    daycare: "bg-green-100 text-green-700",
    home: "bg-gray-100 text-gray-600",
    sick_leave: "bg-red-100 text-red-700",
    unpaid_leave: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h4 className="text-sm font-medium">{format(currentMonth, "MMMM yyyy")}</h4>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSelectedEntity("all")}
          className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
            selectedEntity === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
        >
          All
        </button>
        {entities.map(e => (
          <button
            key={e.id}
            onClick={() => setSelectedEntity(e.id)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              selectedEntity === e.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
          <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map(day => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayPeriods = activePeriods.filter(p => {
            const from = p.date_from;
            const to = p.date_to ?? "2099-12-31";
            return dayStr >= from && dayStr <= to;
          });
          const mainPeriod = dayPeriods[0];
          const colorClass = mainPeriod ? (periodTypeColors[mainPeriod.type] ?? "bg-muted") : "";

          return (
            <div
              key={dayStr}
              className={`relative aspect-square flex items-center justify-center rounded-lg text-xs transition-colors ${
                isToday(day) ? "ring-2 ring-primary font-bold" : ""
              } ${colorClass || "hover:bg-muted/50"}`}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
          <button
            key={m}
            onClick={() => {
              const d = new Date(currentMonth);
              d.setMonth(i);
              setCurrentMonth(d);
            }}
            className={`px-2 py-0.5 text-[10px] rounded-lg transition-colors ${
              currentMonth.getMonth() === i ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function GaugeCard({ available, used, unit, details }: {
  available: number; used: number; unit: string;
  details?: { label: string; value: string }[];
}) {
  const pct = available > 0 ? Math.min(1, used / available) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-24 h-14">
          <svg viewBox="0 0 120 70" className="w-full h-full">
            <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(220 13% 91%)" strokeWidth="8" strokeLinecap="round" />
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              stroke={pct < 0.6 ? "hsl(142 71% 45%)" : pct < 0.85 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${pct * 157} 157`}
            />
          </svg>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{available - used} {unit} left</span>
          <span>{used} used</span>
        </div>
      </div>
      {details && (
        <div className="space-y-1">
          {details.map(d => (
            <div key={d.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanningActivityCardContent() {
  const { entities, periods } = useAppStore();
  const adults = entities.filter(e => e.type === "adult");

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {adults.map(adult => {
          const currentPeriods = periods.filter(p => {
            if (p.entity_id !== adult.id) return false;
            const now = new Date().toISOString().slice(0, 10);
            return p.date_from <= now && (!p.date_to || p.date_to >= now);
          });
          const mainPeriod = currentPeriods[0];
          return (
            <div key={adult.id} className="p-2.5 rounded-bento-inner bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{adult.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                  {mainPeriod?.type.replace(/_/g, " ") ?? "No period"}
                </span>
              </div>
              {mainPeriod?.pct_fte != null && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{mainPeriod.pct_fte}% FTE</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlanningPage() {
  const { entities } = useAppStore();
  const children = entities.filter(e => e.type === "child");

  const cards: BentoCardDefinition[] = [
    {
      id: "calendar",
      title: "Calendar",
      defaultSize: "large",
      render: (p) => (
        <Card title="Calendar" icon={<CalendarDays className="w-4 h-4" />} {...p}>
          <CalendarCardContent />
        </Card>
      ),
    },
    {
      id: "planning-activity",
      title: "Planning Activity",
      defaultSize: "small",
      render: (p) => (
        <Card title="Planning Activity" icon={<Briefcase className="w-4 h-4" />} {...p}>
          <PlanningActivityCardContent />
        </Card>
      ),
    },
    ...children.map((child) => ({
      id: `child-leave-${child.id}`,
      title: `${child.name} — Parental Leave`,
      defaultSize: "small" as const,
      render: (p: Parameters<BentoCardDefinition["render"]>[0]) => (
        <Card title={child.name} subtitle="Parental leave days" icon={<Baby className="w-4 h-4" />} {...p}>
          <GaugeCard
            available={390}
            used={Math.round(Math.random() * 200)}
            unit="days"
            details={
              entities.filter(e => e.type === "adult").map(a => ({
                label: a.name,
                value: `${Math.round(Math.random() * 100)} days used`,
              }))
            }
          />
        </Card>
      ),
    })),
    ...entities.filter(e => e.type === "adult").map(adult => ({
      id: `adult-unemployment-${adult.id}`,
      title: `${adult.name} — Unemployment`,
      defaultSize: "small" as const,
      render: (p: Parameters<BentoCardDefinition["render"]>[0]) => (
        <Card title={adult.name} subtitle="Unemployment insurance" icon={<Umbrella className="w-4 h-4" />} {...p}>
          <GaugeCard
            available={360}
            used={0}
            unit="days"
            details={[
              { label: "Replacement rate", value: "80%" },
              { label: "Day 101+", value: "70%" },
            ]}
          />
        </Card>
      ),
    })),
    ...entities.filter(e => e.type === "adult").map(adult => ({
      id: `adult-holiday-${adult.id}`,
      title: `${adult.name} — Holidays`,
      defaultSize: "small" as const,
      render: (p: Parameters<BentoCardDefinition["render"]>[0]) => (
        <Card title={adult.name} subtitle="Holiday days" icon={<Clock className="w-4 h-4" />} {...p}>
          <GaugeCard
            available={25}
            used={0}
            unit="days"
          />
        </Card>
      ),
    })),
  ];

  return <BentoGrid tab="planning" cards={cards} />;
}

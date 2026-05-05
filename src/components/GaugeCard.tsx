const GAUGE_ARC_D = "M 10 60 A 50 50 0 0 1 110 60";

export function GaugeCard({
  available,
  used,
  unit,
  details,
}: {
  available: number;
  used: number;
  unit: string;
  details?: { label: string; value: string; dotColor?: string }[];
}) {
  const usedFrac = available > 0 ? Math.min(1, Math.max(0, used / available)) : 0;
  const remainingFrac = available > 0 ? Math.min(1, Math.max(0, (available - used) / available)) : 0;
  /** Arc draws left→right; colored segment shows remaining quota on the right end. */
  const stroke =
    remainingFrac > 0.4 ? "hsl(142 71% 45%)" : remainingFrac > 0.15 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-24 h-14">
          <svg viewBox="0 0 120 70" className="w-full h-full">
            <path
              d={GAUGE_ARC_D}
              fill="none"
              stroke="hsl(220 13% 91%)"
              strokeWidth="8"
              strokeLinecap="round"
              pathLength={100}
            />
            <path
              d={GAUGE_ARC_D}
              fill="none"
              stroke={stroke}
              strokeWidth="8"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${remainingFrac * 100} ${100}`}
              strokeDashoffset={-usedFrac * 100}
            />
          </svg>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {Math.max(0, available - used)} {unit} left
          </span>
          <span>{used} used</span>
        </div>
      </div>
      {details && details.length > 0 && (
        <div className="space-y-1">
          {details.map((d) => (
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

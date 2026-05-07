import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Semicircle gauge arc — center (60,60), radius 56. */
export const GAUGE_ARC_D = "M 4 60 A 56 56 0 0 1 116 60";

/** Padding around arc coords so round stroke caps are not clipped by the SVG viewport. */
export const GAUGE_SVG_VIEW_BOX = "-12 -12 144 90";

const GAUGE_STROKE = 12;

export function SemicircleGaugeFrame({
  children,
  center,
  className,
}: {
  children: ReactNode;
  center?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-[11.5rem] h-[8.25rem] max-w-full shrink-0 overflow-visible [&_svg]:block",
        className,
      )}
    >
      <svg
        viewBox={GAUGE_SVG_VIEW_BOX}
        className="h-full w-full max-h-none overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {children}
      </svg>
      {center != null ? (
        <div className="pointer-events-none absolute left-1/2 top-[57%] z-[1] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center px-1 text-center leading-none">
          {center}
        </div>
      ) : null}
    </div>
  );
}

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
  const pctRemaining = available > 0 ? Math.round(remainingFrac * 100) : 0;

  return (
    <div className="relative z-10 -mt-3 space-y-3">
      <div className="flex flex-col items-center gap-2">
        <SemicircleGaugeFrame
          center={<span className="text-2xl font-bold tabular-nums">{pctRemaining}%</span>}
        >
          <path
            d={GAUGE_ARC_D}
            fill="none"
            stroke="hsl(220 13% 91%)"
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            pathLength={100}
          />
          <path
            d={GAUGE_ARC_D}
            fill="none"
            stroke={stroke}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${remainingFrac * 100} ${100}`}
            strokeDashoffset={-usedFrac * 100}
          />
        </SemicircleGaugeFrame>
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

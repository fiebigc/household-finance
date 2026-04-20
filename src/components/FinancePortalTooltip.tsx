import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { TooltipProps } from "recharts";

const ChartTooltipAnchorRefContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

/** Wrap the chart (e.g. around ResponsiveContainer) so the portaled tooltip can map coordinates to the viewport. */
export function ChartTooltipAnchor({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ChartTooltipAnchorRefContext.Provider value={ref}>
      <div ref={ref} className="relative min-h-0 w-full">
        {children}
      </div>
    </ChartTooltipAnchorRefContext.Provider>
  );
}

type PortalTooltipProps = TooltipProps<ValueType, NameType> & {
  formatSek: (n: number) => string;
  formatMonthLabel: (month: string) => string;
};

/**
 * Renders the tooltip in document.body with position:fixed so it is not trapped under
 * later bento cards (backdrop-filter / stacking contexts).
 */
export function PortalCompactSekTooltip({
  active,
  payload,
  label,
  coordinate,
  formatSek,
  formatMonthLabel,
}: PortalTooltipProps) {
  const anchorRef = useContext(ChartTooltipAnchorRefContext);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!active || !payload?.length || !coordinate || !anchorRef?.current) {
      setPos(null);
      return;
    }
    const surface = anchorRef.current.querySelector<SVGSVGElement>(".recharts-surface");
    const el = surface ?? anchorRef.current;
    const br = el.getBoundingClientRect();
    setPos({
      left: br.left + (coordinate.x ?? 0),
      top: br.top + (coordinate.y ?? 0),
    });
  }, [active, anchorRef, coordinate?.x, coordinate?.y, payload?.length]);

  if (!active || !payload?.length || pos == null) {
    return null;
  }

  const header =
    typeof label === "string" && /^\d{4}-\d{2}$/.test(label)
      ? formatMonthLabel(label)
      : String(label ?? "");

  const node = (
    <div
      className="pointer-events-none fixed z-[42] max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border/90 bg-popover/98 px-2 py-1.5 text-[11px] leading-tight text-popover-foreground shadow-xl backdrop-blur-sm"
      style={{ left: pos.left + 10, top: pos.top + 8 }}
    >
      <p className="mb-1 border-b border-border/50 pb-0.5 font-semibold tabular-nums text-foreground">
        {header}
      </p>
      <ul className="flex flex-col gap-px tabular-nums">
        {payload.map((entry, i) => (
          <li
            key={`${String(entry.dataKey)}-${i}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color ?? "transparent" }}
                aria-hidden
              />
              <span className="truncate" title={String(entry.name ?? "")}>
                {entry.name}
              </span>
            </span>
            <span className="shrink-0 font-medium text-foreground">
              {formatSek(Number(entry.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return createPortal(node, document.body);
}

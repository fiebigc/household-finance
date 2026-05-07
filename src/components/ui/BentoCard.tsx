import { cn } from "@/lib/utils";
import type { CardSize } from "@/types/schema";
import { GripVertical, Maximize2, Minimize2, EyeOff, Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  /** Shown as the browser tooltip when hovering the title (use for longer explanations). */
  titleTooltip?: string;
  size?: CardSize;
  icon?: ReactNode;
  /** Shown in the header row before card controls (e.g. key figures). */
  headerTrailing?: ReactNode;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  onHide?: () => void;
  onResize?: (size: CardSize) => void;
  onEdit?: () => void;
  dragHandleProps?: Record<string, unknown>;
}

const sizeOrder: CardSize[] = ["mini", "small", "medium", "large", "full"];

export function Card({
  title,
  subtitle,
  titleTooltip,
  size = "medium",
  icon,
  headerTrailing,
  children,
  className,
  loading,
  onHide,
  onResize,
  onEdit,
  dragHandleProps,
}: CardProps) {
  const [showControls, setShowControls] = useState(false);
  const sizeIdx = sizeOrder.indexOf(size);

  const grow = () => {
    if (sizeIdx < sizeOrder.length - 1 && onResize) onResize(sizeOrder[sizeIdx + 1]);
  };
  const shrink = () => {
    if (sizeIdx > 0 && onResize) onResize(sizeOrder[sizeIdx - 1]);
  };

  return (
    <div
      className={cn(
        "bg-card rounded-bento shadow-bento border border-border/50",
        "flex flex-col gap-0 transition-shadow hover:shadow-bento-hover",
        "h-full overflow-hidden isolate",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* z-0: headline strip stays under semicircle gauges that extend upward from the body */}
      <div className="relative z-0 shrink-0 rounded-t-bento border-b border-border/45 bg-muted/40 px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {dragHandleProps && (
              <button {...dragHandleProps} className="touch-none cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <GripVertical className="w-4 h-4" />
              </button>
            )}
            {icon && <span className="shrink-0 text-primary">{icon}</span>}
            <div className="min-w-0">
              <h3
                className={cn(
                  "text-sm font-semibold truncate",
                  titleTooltip && "cursor-help underline decoration-dotted decoration-border underline-offset-2"
                )}
                title={titleTooltip ?? undefined}
              >
                {title}
              </h3>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerTrailing}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="p-1 rounded hover:bg-muted/80 text-muted-foreground"
                title="Edit values"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {showControls && (onResize || onHide) && (
              <>
                {onResize && sizeIdx > 0 && (
                  <button onClick={shrink} className="p-1 rounded hover:bg-muted/80 text-muted-foreground" title="Shrink">
                    <Minimize2 className="w-3 h-3" />
                  </button>
                )}
                {onResize && sizeIdx < sizeOrder.length - 1 && (
                  <button onClick={grow} className="p-1 rounded hover:bg-muted/80 text-muted-foreground" title="Grow">
                    <Maximize2 className="w-3 h-3" />
                  </button>
                )}
                {onHide && (
                  <button onClick={onHide} className="p-1 rounded hover:bg-muted/80 text-muted-foreground" title="Hide card">
                    <EyeOff className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="relative z-10 flex-1 flex items-center justify-center px-5 py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card-content-layer relative z-10 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

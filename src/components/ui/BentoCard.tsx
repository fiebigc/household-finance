import { cn } from "@/lib/utils";
import type { CardSize } from "@/types/schema";
import { GripVertical, Maximize2, Minimize2, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  size?: CardSize;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  onHide?: () => void;
  onResize?: (size: CardSize) => void;
  dragHandleProps?: Record<string, unknown>;
}

const sizeOrder: CardSize[] = ["mini", "small", "medium", "large", "full"];

export function Card({
  title,
  subtitle,
  size = "medium",
  icon,
  children,
  className,
  loading,
  onHide,
  onResize,
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
        "p-5 flex flex-col gap-3 transition-shadow hover:shadow-bento-hover",
        "h-full overflow-hidden",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <button {...dragHandleProps} className="touch-none cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        {showControls && (onResize || onHide) && (
          <div className="flex items-center gap-1 shrink-0">
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
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      )}
    </div>
  );
}

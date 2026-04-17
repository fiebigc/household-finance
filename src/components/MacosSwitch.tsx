import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  className?: string;
}

/**
 * macOS-style on/off switch (pill track + sliding thumb).
 */
export function MacosSwitch({
  id,
  checked,
  onCheckedChange,
  label,
  className,
}: Props) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          "mac-switch-track relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full border border-black/5 px-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          checked ? "bg-primary" : "bg-[#e3e3e5] dark:bg-muted",
        )}
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={cn(
            "mac-switch-thumb pointer-events-none block h-[25px] w-[25px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.06)] transition-[transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}

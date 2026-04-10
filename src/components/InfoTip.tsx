import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className={`inline-block h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground ${className ?? ""}`} />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

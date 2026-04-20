import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Building2,
  Bus,
  CircleDollarSign,
  HandCoins,
  HeartPulse,
  MoreHorizontal,
  Receipt,
  Shield,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecurringFlowCategoryId } from "@/utils/finance/recurringFlowCategory";

const ICONS: Record<RecurringFlowCategoryId, LucideIcon> = {
  housing: Building2,
  utilities: Zap,
  transport: Bus,
  food: UtensilsCrossed,
  insurance: Shield,
  subscriptions: Receipt,
  childcare: Baby,
  health: HeartPulse,
  salary: CircleDollarSign,
  benefits: HandCoins,
  other: MoreHorizontal,
};

export function RecurringCategoryIcon({
  categoryId,
  className,
}: {
  categoryId: RecurringFlowCategoryId;
  className?: string;
}) {
  const Icon = ICONS[categoryId] ?? ICONS.other;
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden />;
}

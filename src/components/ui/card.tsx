import * as React from "react";

import { cn } from "@/lib/utils";
import type { BentoCardSurfaceTheme } from "@/config/bentoCardSurfaces";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Scoped bento tile palette (inherits page theme when omitted or `light`). */
  bentoSurface?: BentoCardSurfaceTheme;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, bentoSurface = "light", ...props }, ref) => (
    <div
      ref={ref}
      data-bento-surface={bentoSurface === "light" ? undefined : bentoSurface}
      className={cn(
        "rounded-[22px] border border-border/70 bg-card text-card-foreground shadow-bento backdrop-blur-xl backdrop-saturate-[1.25] dark:border-border/80 dark:bg-card/85",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-sm font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

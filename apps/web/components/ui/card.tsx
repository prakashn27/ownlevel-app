import * as React from "react";
import { cn } from "@/lib/utils";

const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...p} />
);
const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1.5 p-6", className)} {...p} />
);
const CardTitle = ({ className, ...p }: React.ComponentProps<"h2">) => (
  <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...p} />
);
const CardDescription = ({ className, ...p }: React.ComponentProps<"p">) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...p} />
);
const CardContent = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("p-6 pt-0", className)} {...p} />
);

export { Card, CardHeader, CardTitle, CardDescription, CardContent };

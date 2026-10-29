import * as React from "react";
import { cn } from "@/lib/utils";

const Table = ({ className, ...p }: React.ComponentProps<"table">) => (
  <div className="w-full overflow-auto rounded-lg border bg-card">
    <table className={cn("w-full text-sm", className)} {...p} />
  </div>
);
const TableBody = (p: React.ComponentProps<"tbody">) => <tbody className="[&_tr:last-child]:border-0" {...p} />;
const TableRow = ({ className, ...p }: React.ComponentProps<"tr">) => (
  <tr className={cn("border-b transition-colors hover:bg-muted/50", className)} {...p} />
);
const TableHead = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("h-10 px-4 text-left align-middle font-medium text-muted-foreground", className)} {...p} />
);
const TableCell = ({ className, ...p }: React.ComponentProps<"td">) => (
  <td className={cn("px-4 py-3 align-middle", className)} {...p} />
);

export { Table, TableBody, TableRow, TableHead, TableCell };

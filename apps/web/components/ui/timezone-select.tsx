"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ZONES = Intl.supportedValuesOf("timeZone");

/**
 * Searchable IANA timezone picker. Submits through a hidden input named `name`.
 * With `emptyLabel`, an extra first option submits "" (e.g. "Agency default").
 */
export function TimezoneSelect({
  name, defaultValue = "", emptyLabel, className,
}: { name: string; defaultValue?: string; emptyLabel?: string; className?: string }) {
  const t = useTranslations("timezone");
  const [value, setValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const matches = ZONES.filter((z) => z.toLowerCase().includes(q.trim().toLowerCase().replace(/\s+/g, "_")));

  function pick(v: string) {
    setValue(v);
    setOpen(false);
  }

  const item = "flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground";

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(""); }}>
      <input type="hidden" name={name} value={value} />
      <Popover.Trigger
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{value || emptyLabel || t("select")}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-md border bg-card text-card-foreground shadow-md"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="max-h-64 overflow-y-auto p-1">
            {emptyLabel && !q && (
              <button type="button" className={item} onClick={() => pick("")}>
                {emptyLabel} {!value && <Check className="size-4" />}
              </button>
            )}
            {matches.map((z) => (
              <button type="button" key={z} className={item} onClick={() => pick(z)}>
                {z} {z === value && <Check className="size-4" />}
              </button>
            ))}
            {matches.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{t("none")}</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

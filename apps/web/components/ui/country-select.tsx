"use client";
import { getCountries } from "libphonenumber-js/min";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/** Country picker (ISO 3166-1 alpha-2), names in the UI language. With `emptyLabel`, an extra first option has value "". */
export function CountrySelect({ name, value, defaultValue, onChange, emptyLabel, className, id, required }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (v: string) => void; emptyLabel?: string; className?: string; id?: string; required?: boolean;
}) {
  const locale = useLocale();
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return getCountries().map((c) => ({ code: c, name: names.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  return (
    <select
      id={id}
      name={name}
      required={required}
      {...(value !== undefined ? { value } : { defaultValue })}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={cn("h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
    </select>
  );
}

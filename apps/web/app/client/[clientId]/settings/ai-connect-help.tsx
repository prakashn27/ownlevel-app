"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** An info button that opens the steps customers follow to add the booking link to Claude or ChatGPT. */
export function AiConnectHelp({ link }: { link: string }) {
  const t = useTranslations("client.settings");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const steps = (app: "claude" | "chatgpt", count: number) => (
    <ol className="my-1 list-decimal pl-5 text-sm">
      {Array.from({ length: count }, (_, i) => <li key={i}>{t(`aiHow.${app}${i + 1}` as never)}</li>)}
    </ol>
  );

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label={t("aiHowButton")} title={t("aiHowButton")} onClick={() => setOpen(true)}>ⓘ</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={t("aiHow.title")} className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mt-0">{t("aiHow.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("aiHow.intro")}</p>
            <code className="block break-all rounded bg-muted p-2 text-xs">{link}</code>
            <h3>{t("aiHow.claudeTitle")}</h3>
            {steps("claude", 4)}
            <h3>{t("aiHow.chatgptTitle")}</h3>
            {steps("chatgpt", 3)}
            <p className="text-sm text-muted-foreground">{t("aiHow.note")}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(t("aiHow.message", { link })); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? t("copied") : t("aiHow.copyMessage")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("aiHow.close")}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

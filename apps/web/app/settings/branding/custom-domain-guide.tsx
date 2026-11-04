import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

export async function CustomDomainGuide({ host }: { host: string }) {
  const t = await getTranslations("branding.domain");
  return (
    <>
      <h2>{t("title")}</h2>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 text-sm">
          <p className="text-muted-foreground">{t("intro", { host })}</p>
          <div>
            <h3 className="font-semibold">{t("beforeTitle")}</h3>
            <ul className="ml-5 list-disc">
              <li>{t("before1")}</li>
              <li>{t("before2")}</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">{t("stepsTitle")}</h3>
            <ol className="ml-5 list-decimal">
              {(["step1", "step2", "step3", "step4", "step5"] as const).map((k) => <li key={k}>{t(k)}</li>)}
            </ol>
          </div>
          <div>
            <h3 className="font-semibold">{t("recordsTitle")}</h3>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-4 font-medium">{t("recordType")}</th>
                  <th className="pr-4 font-medium">{t("recordName")}</th>
                  <th className="font-medium">{t("recordValue")}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                <tr><td className="pr-4">TXT</td><td className="pr-4">_ownlevel-verify.app.youragency.com</td><td className="font-sans text-sm">{t("txtValue")}</td></tr>
                <tr><td className="pr-4">CNAME</td><td className="pr-4">app.youragency.com</td><td>domains.ownlevel.app</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{t("cloudflareNote")}</p>
          </div>
          <div>
            <h3 className="font-semibold">{t("afterTitle")}</h3>
            <ul className="ml-5 list-disc">
              <li>{t("after1", { host })}</li>
              <li>{t("after2", { host })}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

"use client";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useClient } from "./client-workspace";

export default function Overview() {
  const { client } = useClient();
  const t = useTranslations();
  return (
    <Table>
      <TableBody>
        <TableRow><TableHead className="w-40">{t("client.overview.status")}</TableHead><TableCell>{client.status === "archived" ? t("common.archived") : t("common.active")}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">{t("client.overview.timezone")}</TableHead><TableCell>{client.timezone}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">{t("client.overview.currency")}</TableHead><TableCell>{client.currency}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">{t("client.overview.created")}</TableHead><TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

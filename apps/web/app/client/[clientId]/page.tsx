"use client";
import { Table, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useClient } from "./client-workspace";

export default function Overview() {
  const { client } = useClient();
  return (
    <Table>
      <TableBody>
        <TableRow><TableHead className="w-40">Status</TableHead><TableCell>{client.status === "archived" ? "Archived" : "Active"}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">Timezone</TableHead><TableCell>{client.timezone}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">Currency</TableHead><TableCell>{client.currency}</TableCell></TableRow>
        <TableRow><TableHead className="w-40">Created</TableHead><TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

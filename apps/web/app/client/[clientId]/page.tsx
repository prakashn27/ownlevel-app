"use client";
import { useClient } from "./client-workspace";

export default function Overview() {
  const { client } = useClient();
  return (
    <table>
      <tbody>
        <tr><th>Status</th><td>{client.status === "archived" ? "Archived" : "Active"}</td></tr>
        <tr><th>Timezone</th><td>{client.timezone}</td></tr>
        <tr><th>Currency</th><td>{client.currency}</td></tr>
        <tr><th>Created</th><td>{new Date(client.createdAt).toLocaleDateString()}</td></tr>
      </tbody>
    </table>
  );
}

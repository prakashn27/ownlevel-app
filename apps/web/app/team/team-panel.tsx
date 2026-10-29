"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { api } from "../../lib/api";

type Team = {
  members: { userId: string; name: string; email: string; role: string; roleName: string }[];
  pending: { id: string; email: string; roleName: string; expiresAt: string }[];
};

export function TeamPanel() {
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Team>("/api/team");
    if (r.ok) setTeam(r.data);
    else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setNotice(null); setPending(true);
    const f = new FormData(form);
    const r = await api<{ email: string }>("/api/team/invitations", { body: { email: f.get("email"), role: f.get("role") } });
    setPending(false);
    if (!r.ok) { void load(); return setError(r.error); }
    setNotice(`Invitation sent to ${r.data.email}`);
    form.reset();
    void load();
  }

  async function revoke(id: string) {
    await api(`/api/team/invitations/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <>
      <h1>Team</h1>
      <form onSubmit={invite} className="mb-4 flex items-center gap-2">
        <Input name="email" type="email" placeholder="Email to invite" required />
        <Select name="role" defaultValue="agency_user">
          <SelectTrigger className="w-44 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agency_user">Agency user</SelectItem>
            <SelectItem value="agency_admin">Agency admin</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={pending}>Invite</Button>
      </form>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {team && (
        <>
          <h2>Members</h2>
          <Table>
            <TableBody>
              {team.members.map((m) => (
                <TableRow key={m.userId}><TableCell className="font-medium">{m.name}</TableCell><TableCell>{m.email}</TableCell><TableCell><Badge>{m.roleName}</Badge></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          {team.pending.length > 0 && (
            <>
              <h2>Pending invitations</h2>
              <Table>
                <TableBody>
                  {team.pending.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.email}</TableCell><TableCell><Badge>{p.roleName}</Badge></TableCell>
                      <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => revoke(p.id)}>Revoke</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </>
      )}
    </>
  );
}

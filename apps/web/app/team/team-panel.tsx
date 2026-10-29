"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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
      <form onSubmit={invite} className="row" style={{ flexDirection: "row" }}>
        <input name="email" type="email" placeholder="Email to invite" required />
        <select name="role" defaultValue="agency_user">
          <option value="agency_user">Agency user</option>
          <option value="agency_admin">Agency admin</option>
        </select>
        <button disabled={pending}>Invite</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}
      {team && (
        <>
          <h2>Members</h2>
          <table>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.userId}><td>{m.name}</td><td>{m.email}</td><td>{m.roleName}</td></tr>
              ))}
            </tbody>
          </table>
          {team.pending.length > 0 && (
            <>
              <h2>Pending invitations</h2>
              <table>
                <tbody>
                  {team.pending.map((p) => (
                    <tr key={p.id}>
                      <td>{p.email}</td><td>{p.roleName}</td>
                      <td><button className="secondary" onClick={() => revoke(p.id)}>Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}

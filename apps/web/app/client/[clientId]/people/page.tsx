"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../../../lib/api";
import { useClient } from "../client-workspace";

type Team = {
  members: { userId: string; name: string; email: string; roleName: string }[];
  pending: { id: string; email: string; roleName: string }[];
};

export default function People() {
  const { client, label } = useClient();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Team>(`/api/clients/${client.id}/team`);
    if (r.ok) setTeam(r.data);
    else setError(r.error);
  }, [client.id]);
  useEffect(() => { void load(); }, [load]);

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setNotice(null); setPending(true);
    const f = new FormData(form);
    const r = await api<{ email: string }>(`/api/clients/${client.id}/invitations`, { body: { email: f.get("email"), role: f.get("role") } });
    setPending(false);
    void load();
    if (!r.ok) return setError(r.error);
    setNotice(`Invitation sent to ${r.data.email}`);
    form.reset();
  }

  async function revoke(id: string) {
    await api(`/api/team/invitations/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <>
      <p className="hint">People at this {label.toLowerCase()} who can sign in to its portal.</p>
      {client.status === "archived" ? (
        <p className="hint">This {label.toLowerCase()} is archived. Restore it in Settings to invite people.</p>
      ) : (
        <form onSubmit={invite} className="row" style={{ flexDirection: "row" }}>
          <input name="email" type="email" placeholder="Email to invite" required />
          <select name="role" defaultValue="client_user">
            <option value="client_user">Client user</option>
            <option value="client_admin">Client admin</option>
          </select>
          <button disabled={pending}>Invite</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}
      {team && team.members.length === 0 && team.pending.length === 0 && <p>No one has access yet.</p>}
      {team && team.members.length > 0 && (
        <table><tbody>
          {team.members.map((m) => <tr key={m.userId}><td>{m.name}</td><td>{m.email}</td><td>{m.roleName}</td></tr>)}
        </tbody></table>
      )}
      {team && team.pending.length > 0 && (
        <>
          <h2>Pending invitations</h2>
          <table><tbody>
            {team.pending.map((p) => (
              <tr key={p.id}>
                <td>{p.email}</td><td>{p.roleName}</td>
                <td><button className="secondary" onClick={() => revoke(p.id)}>Revoke</button></td>
              </tr>
            ))}
          </tbody></table>
        </>
      )}
    </>
  );
}

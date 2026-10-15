import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CREATE_INVITATION, INVITATIONS, REVOKE_INVITATION } from '../invitation-operations';
import type { Invitation } from '../invitation-operations';
import { explainError } from '../errors';

export function Invitations() {
  const [email, setEmail] = useState('');
  const [offset, setOffset] = useState(0);
  const [created, setCreated] = useState<{ url: string; email: string }>();
  const [message, setMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<Invitation | null>(null);
  const { data, loading, error, refetch } = useQuery<{ invitations: { items: Invitation[]; total: number } }>(INVITATIONS, { variables: { offset, limit: 20 }, fetchPolicy: 'cache-and-network', pollInterval: 60000 });
  const [create, { loading: creating }] = useMutation<{ createInvitation: { token: string; invitation: Invitation } }, { email: string }>(CREATE_INVITATION);
  const [revoke, { loading: revoking }] = useMutation(REVOKE_INVITATION);
  async function invite(event: FormEvent) {
    event.preventDefault(); setMessage(''); setCopyMessage('');
    try {
      const result = await create({ variables: { email }, refetchQueries: [INVITATIONS], awaitRefetchQueries: true });
      const invitation = result.data?.createInvitation;
      if (!invitation) throw new Error('Unable to create invitation.');
      setCreated({ email: invitation.invitation.email, url: `${location.origin}/#register?invite=${encodeURIComponent(invitation.token)}&email=${encodeURIComponent(invitation.invitation.email)}` });
      setEmail(''); setOffset(0);
    } catch (error) { setMessage(explainError(error)); }
  }
  async function revokeConfirmed() {
    if (!confirmRevoke) return;
    try {
      await revoke({ variables: { id: confirmRevoke.id }, refetchQueries: [INVITATIONS], awaitRefetchQueries: true });
      if (created?.email === confirmRevoke.email) setCreated(undefined);
      setConfirmRevoke(null); setMessage('');
    } catch (error) { setMessage(explainError(error)); }
  }
  const total = data?.invitations.total ?? 0;
  return <section className="card invitations"><div className="section-heading"><div><p className="eyebrow">CONTROLLED WORKSPACE ACCESS</p><h2>Invite a colleague</h2></div><button className="secondary" onClick={() => void refetch().catch(() => {})}>Refresh</button></div><p className="muted">Create a seven-day, single-use invitation for an employee account. Email delivery is not configured: share the link privately yourself.</p>
    <form className="invite-form" onSubmit={invite}><label>Colleague's email<input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@company.com"/></label><button disabled={creating}>{creating ? 'Creating…' : 'Create invitation'}</button></form>
    {message && <p className="notice error" role="alert">{message}</p>}
    {created && <div className="invite-created"><strong>Invitation for {created.email}</strong><p className="footnote">Copy this link now. It cannot be retrieved later; revoke and recreate it if lost. Treat it as a credential.</p><label>Invitation link<input readOnly value={created.url} onFocus={event => event.target.select()}/></label><button className="secondary" onClick={() => { void navigator.clipboard.writeText(created.url).then(() => setCopyMessage('Link copied.')).catch(() => setCopyMessage('Select the link above and copy it manually.')); }}>Copy invitation link</button>{copyMessage && <p role="status">{copyMessage}</p>}</div>}
    {confirmRevoke && <div className="notice"><p>Revoke the invitation for <strong>{confirmRevoke.email}</strong>? Its link will stop working.</p><div className="return-actions"><button disabled={revoking} onClick={() => void revokeConfirmed()}>{revoking ? 'Revoking…' : 'Confirm revoke'}</button><button className="secondary" disabled={revoking} onClick={() => setConfirmRevoke(null)}>Cancel</button></div></div>}
    {loading && <p role="status">Loading invitations…</p>}{error && <p className="notice error" role="alert">{explainError(error)}</p>}
    <div className="invitation-list">{data?.invitations.items.map(invitation => {
      const status = invitation.acceptedAt ? 'Accepted' : invitation.revokedAt ? 'Revoked' : Date.parse(invitation.expiresAt) <= Date.now() ? 'Expired' : 'Pending';
      return <article key={invitation.id}><div><strong>{invitation.email}</strong><p className="footnote">Expires {new Date(invitation.expiresAt).toLocaleString()}</p></div><span className="badge">{status}</span>{status === 'Pending' && <button className="secondary" onClick={() => setConfirmRevoke(invitation)}>Revoke</button>}</article>;
    })}</div>{!loading && !total && <p className="footnote">No invitations yet.</p>}
    {total > 20 && <div className="pagination"><span>Invitations {offset + 1}–{Math.min(offset + 20, total)} of {total}</span><div><button className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</button><button className="secondary" disabled={loading || offset + 20 >= total} onClick={() => setOffset(value => value + 20)}>Next</button></div></div>}
  </section>;
}

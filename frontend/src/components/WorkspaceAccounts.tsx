import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { LINK_ACCOUNT, ME, USERS, SET_ACCOUNT_ACTIVE } from '../auth-operations';
import { Invitations } from './Invitations';
import type { Account } from '../auth-operations';
import { DIRECTORY } from '../operations';
import type { Employee } from '../operations';
import { explainError } from '../errors';
import { EmployeeEditor } from './EmployeeEditor';

export function WorkspaceAccounts() {
  const { data, loading, error } = useQuery<{ users: Account[] }>(USERS, { fetchPolicy: 'network-only' });
  const { data: directory, loading: directoryLoading, error: directoryError } = useQuery<{ employees: Employee[] }>(DIRECTORY, { fetchPolicy: 'network-only' });
  const [link, { loading: saving }] = useMutation(LINK_ACCOUNT);
  const [editing, setEditing] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const [pendingStatus, setPendingStatus] = useState<Account | null>(null);
  const [creatingFor, setCreatingFor] = useState<Account | null>(null);
  const [setActive, { loading: changingStatus }] = useMutation(SET_ACCOUNT_ACTIVE);
  async function confirmStatus() {
    if (!pendingStatus) return;
    setMessage(undefined);
    try {
      await setActive({ variables: { userId: pendingStatus.id, active: !pendingStatus.active }, refetchQueries: [USERS], awaitRefetchQueries: true });
      setMessage({ error: false, text: pendingStatus.active ? 'Account deactivated. All sessions have ended. Equipment ownership and employee records are unchanged.' : 'Account reactivated. The employee can sign in again; previous sessions remain revoked.' });
      setPendingStatus(null);
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  async function save(userId: string) {
    setMessage(undefined);
    try {
      await link({ variables: { userId, employeeId: employeeId || null }, refetchQueries: [USERS, ME], awaitRefetchQueries: true });
      setEditing(null);
      setMessage({ error: false, text: 'Employee link saved. The account holder should refresh their workspace to reconnect live updates.' });
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Workspace accounts</h1><p className="muted">Link each account to its employee record to enable personal equipment access.</p></div></div>
    {message && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    {creatingFor && <EmployeeEditor key={creatingFor.id} account={creatingFor} onCancel={() => setCreatingFor(null)} onSaved={() => { setCreatingFor(null); setMessage({ error: false, text: 'Employee created and linked. The account holder should refresh their workspace to load their employee record.' }); }}/>} 
    <Invitations/>
    {pendingStatus && <section className="card account-status-confirm"><h2>{pendingStatus.active ? 'Deactivate' : 'Reactivate'} {pendingStatus.name}?</h2><p className="muted">{pendingStatus.active ? 'This ends every session and blocks sign-in. The employee record, device assignments, and history are preserved. Recover company equipment separately if needed.' : 'The account can sign in again using its existing password. Old sessions will not be restored.'}</p><div className="return-actions"><button disabled={changingStatus} onClick={() => void confirmStatus()}>{changingStatus ? 'Updating…' : pendingStatus.active ? 'Confirm deactivation' : 'Confirm reactivation'}</button><button className="secondary" disabled={changingStatus} onClick={() => setPendingStatus(null)}>Cancel</button></div></section>}
    <section className="card">{loading && <p role="status">Loading accounts…</p>}{(error || directoryError) && <p className="notice error" role="alert">{explainError(error ?? directoryError)}</p>}
      <div className="account-list">{data?.users.map(user => <div className="account-row" key={user.id}><article><span className="avatar">{user.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><h3>{user.name}</h3><p className="muted">{user.email}</p><p className="footnote">{user.employee ? `Employee: ${user.employee.name}` : 'No employee linked'}</p></div><span className="badge">{user.role}</span>{!user.employee && user.active && <button className="secondary" onClick={() => { setCreatingFor(user); setEditing(null); setMessage(undefined); }}>Create employee</button>}{!user.active && <span className="badge inactive-badge">INACTIVE</span>}{user.role !== 'ADMIN' && <button className="secondary" disabled={changingStatus} onClick={() => setPendingStatus(user)}>{user.active ? 'Deactivate' : 'Reactivate'}</button>}<button className="secondary" disabled={saving} onClick={() => { setEditing(user.id); setEmployeeId(user.employee?.id ?? ''); setMessage(undefined); }}>{user.employee ? 'Change link' : 'Link employee'}</button></article>
        {editing === user.id && <form className="link-employee-form" onSubmit={event => { event.preventDefault(); void save(user.id); }}><label>Employee for {user.name}<select disabled={directoryLoading || Boolean(directoryError) || saving} value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">No employee (unlink)</option>{directory?.employees.map(employee => {
          const other = data.users.find(account => account.id !== user.id && account.employee?.id === employee.id);
          return <option key={employee.id} value={employee.id} disabled={Boolean(other)}>{employee.name} · {employee.email}{other ? ' · Already linked' : ''}</option>;
        })}</select></label><button disabled={saving || directoryLoading || Boolean(directoryError)}>{directoryLoading ? 'Loading employees…' : saving ? 'Saving…' : 'Save link'}</button><button type="button" className="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></form>}
      </div>)}</div><p className="footnote">One account per employee. A matching email does not automatically grant access. Changing or removing a link immediately disconnects that account's existing live streams. Roles and employee assignments are unchanged.</p>
    </section></>;
}




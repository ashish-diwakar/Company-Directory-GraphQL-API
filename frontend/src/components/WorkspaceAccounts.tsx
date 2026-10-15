import { useQuery } from '@apollo/client/react';
import { USERS } from '../auth-operations';
import type { Account } from '../auth-operations';
import { explainError } from '../errors';
export function WorkspaceAccounts() {
  const { data, loading, error } = useQuery<{ users: Account[] }>(USERS, { fetchPolicy: 'network-only' });
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Workspace accounts</h1><p className="muted">The people with access to your workspace.</p></div></div><section className="card">{loading && <p role="status">Loading accounts…</p>}{error && <p className="notice error" role="alert">{explainError(error)}</p>}<div className="account-list">{data?.users.map(user => <article key={user.id}><span className="avatar">{user.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><h3>{user.name}</h3><p className="muted">{user.email}</p></div><span className="badge">{user.role}</span></article>)}</div><p className="footnote">The first registered user is the administrator. Registration cannot request or change a role. Login accounts and directory employee records are managed separately.</p></section></>;
}

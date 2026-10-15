import { useQuery, useSubscription } from '@apollo/client/react';
import { useState } from 'react';
import { ME, MY_EQUIPMENT, MY_EQUIPMENT_CHANGED } from '../auth-operations';
import type { Account } from '../auth-operations';
import type { EquipmentItem } from '../inventory-operations';
import { explainError } from '../errors';

export function MyEquipment({ user }: { user: Account }) {
  const { data, loading, error, refetch, client } = useQuery<{ myEquipment: EquipmentItem[] }>(MY_EQUIPMENT, { fetchPolicy: 'cache-and-network' });
  const [notice, setNotice] = useState('');
  const { error: liveError, restart } = useSubscription(MY_EQUIPMENT_CHANGED, {
    onData: () => {
      setNotice('Your equipment list changed. The latest details are shown below.');
      void refetch().catch(() => {});
      void client.refetchQueries({ include: [ME] }).catch(() => {});
    },
  });
  return <><div className="page-heading"><div><p className="eyebrow">YOUR TOOLS, IN ONE PLACE</p><h1>My equipment</h1><p className="muted">{user.employee ? `Devices currently assigned to ${user.employee.name}.` : 'Your personal equipment workspace.'}</p></div><button className="secondary" onClick={() => { void refetch().catch(() => {}); void client.refetchQueries({ include: [ME] }).catch(() => {}); restart(); }}>Refresh</button></div>
    {notice && <p className="notice success" role="status">{notice}</p>}
    {liveError && <p className="notice error" role="alert">Live updates disconnected. Refresh this page to reconnect. {explainError(liveError)}</p>}
    {loading && <p role="status">Loading your equipment…</p>}{error && <p className="notice error" role="alert">{explainError(error)}</p>}
    {!user.employee ? <section className="card"><h2>Your account is not linked yet</h2><p className="muted">Ask an administrator to link your account to your employee record in Accounts. You can still browse the people directory. No equipment from other employees is shown here.</p></section> : <section className="card"><div className="section-heading"><h2>Assigned devices <span className="count">{data?.myEquipment.length ?? 0}</span></h2><span className="badge">PERSONAL</span></div>{!loading && !error && data?.myEquipment.length === 0 && <div className="empty"><p>No equipment assigned yet</p><small>Your devices will appear here when an administrator assigns them.</small></div>}<div className="people">{data?.myEquipment.map(item => <article className="person" key={item.id}><p className="eyebrow">{item.type}</p><h3>{item.model}</h3><p className="muted">Serial: {item.serialNumber}</p></article>)}</div></section>}
  </>;
}

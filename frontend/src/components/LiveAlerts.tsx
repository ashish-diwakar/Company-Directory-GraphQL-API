import { useApolloClient, useSubscription } from '@apollo/client/react';
import { useState } from 'react';
import { ALERTS, DIRECTORY } from '../operations';
import type { Assignment } from '../operations';
import { explainError } from '../errors';
import { INVENTORY } from '../inventory-operations';
import { HISTORY, RETURN_ALERTS } from '../history-operations';
export function LiveAlerts({ authenticated, admin = false }: { authenticated: boolean; admin?: boolean }) {
  const apollo = useApolloClient();
  const [events, setEvents] = useState<{ item: Assignment; action: 'assigned' | 'returned'; time: string; key: string }[]>([]);
  const { error: assignmentError, restart } = useSubscription<{ equipmentAssigned: Assignment }>(ALERTS, {
    skip: !authenticated,
    onData: ({ data }) => {
      const item = data.data?.equipmentAssigned;
      if (!item) return;
      setEvents(previous => [{ item, action: 'assigned' as const, time: new Date().toLocaleTimeString(), key: crypto.randomUUID() }, ...previous].slice(0, 8));
      void apollo.refetchQueries({ include: [DIRECTORY, INVENTORY, HISTORY] }).catch(() => {});
    },
  });
  const { error: returnError, restart: restartReturns } = useSubscription<{ equipmentReturned: Assignment }>(RETURN_ALERTS, {
    skip: !authenticated || !admin,
    onData: ({ data }) => {
      const item = data.data?.equipmentReturned;
      if (!item) return;
      setEvents(previous => [{ item, action: 'returned' as const, time: new Date().toLocaleTimeString(), key: crypto.randomUUID() }, ...previous].slice(0, 8));
      void apollo.refetchQueries({ include: [DIRECTORY, INVENTORY, HISTORY] }).catch(() => {});
    },
  });
  const error = assignmentError ?? returnError;
  return <section className="card"><div className="section-heading"><div><p className="eyebrow">REAL-TIME ACTIVITY</p><h2>Live alerts</h2></div><span className={`signal ${authenticated && !error ? 'active' : ''}`}>{!authenticated ? 'Sign in' : error ? 'Disconnected' : 'Listening'}</span></div>{error && <p role="alert" className="notice error">{explainError(error)} <button className="secondary" onClick={() => { restart(); if (admin) restartReturns(); }}>Reconnect</button></p>}<div aria-live="polite">{events.length ? events.map(event => <article className="event" key={event.key}><span className="event-dot"/><div><strong>{event.item.model}</strong><p>{event.action === 'returned' ? 'Returned to unassigned stock' : `Assigned to ${event.item.assignedTo?.name ?? 'an employee'}`}</p><small>{event.time}</small></div></article>) : <div className="empty"><span>↗</span><p>No assignments yet</p><small>{authenticated ? 'New assignments will appear here instantly.' : 'Add a token to subscribe to assignment updates.'}</small></div>}</div></section>;
}



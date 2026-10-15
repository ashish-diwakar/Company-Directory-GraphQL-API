import { useApolloClient, useSubscription } from '@apollo/client/react';
import { useState } from 'react';
import { ALERTS, DIRECTORY } from '../operations';
import type { Assignment } from '../operations';
import { explainError } from '../errors';
export function LiveAlerts({ authenticated }: { authenticated: boolean }) {
  const apollo = useApolloClient();
  const [events, setEvents] = useState<{ item: Assignment; time: string; key: string }[]>([]);
  const { error } = useSubscription<{ equipmentAssigned: Assignment }>(ALERTS, {
    skip: !authenticated,
    onData: ({ data }) => {
      const item = data.data?.equipmentAssigned;
      if (!item) return;
      setEvents(previous => [{ item, time: new Date().toLocaleTimeString(), key: crypto.randomUUID() }, ...previous].slice(0, 8));
      void apollo.refetchQueries({ include: [DIRECTORY] }).catch(() => {});
    },
  });
  return <section className="card"><div className="section-heading"><div><p className="eyebrow">REAL-TIME ACTIVITY</p><h2>Live alerts</h2></div><span className={`signal ${authenticated && !error ? 'active' : ''}`}>{!authenticated ? 'Sign in' : error ? 'Disconnected' : 'Listening'}</span></div>{error && <p role="alert" className="notice error">{explainError(error)}</p>}<div aria-live="polite">{events.length ? events.map(event => <article className="event" key={event.key}><span className="event-dot"/><div><strong>{event.item.model}</strong><p>Assigned to {event.item.assignedTo?.name ?? 'an employee'}</p><small>{event.time}</small></div></article>) : <div className="empty"><span>↗</span><p>No assignments yet</p><small>{authenticated ? 'New assignments will appear here instantly.' : 'Add a token to subscribe to assignment updates.'}</small></div>}</div></section>;
}

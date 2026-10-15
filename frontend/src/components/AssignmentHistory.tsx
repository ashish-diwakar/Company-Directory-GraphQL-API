import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { HISTORY } from '../history-operations';
import type { AssignmentEvent } from '../history-operations';
import { explainError } from '../errors';

export function AssignmentHistory({ equipment, onClose }: { equipment: { id: string; model: string } | null; onClose: () => void }) {
  const [offset, setOffset] = useState(0);
  const { data, loading, error, refetch } = useQuery<{ equipmentHistory: { items: AssignmentEvent[]; total: number } }>(HISTORY, {
    variables: { equipmentId: equipment?.id ?? null, offset, limit: 20 }, fetchPolicy: 'cache-and-network',
  });
  const total = data?.equipmentHistory.total ?? 0;
  return <section className="card history-panel" aria-label="Assignment history"><div className="section-heading"><div><p className="eyebrow">ASSIGNMENT AUDIT TRAIL</p><h2>{equipment ? `History · ${equipment.model}` : 'All assignment history'}</h2></div><button className="secondary" onClick={onClose}>Close history</button></div>
    <p className="muted">Ownership changes recorded from this milestone onward. Existing assignments have no retroactive history.</p>
    {loading && <p role="status">Loading history…</p>}{error && <p className="notice error" role="alert">{explainError(error)}</p>}
    {!loading && !error && !total && <div className="empty"><p>No recorded changes yet.</p><small>Assign, reassign, or return a device to create its first history entry.</small></div>}
    <ol className="history-list">{data?.equipmentHistory.items.map(event => <li key={event.id}><div className="history-title"><strong>{event.equipmentModel}</strong><span className="badge">{event.action}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div><p className="serial">{event.serialNumber}</p><p>{event.fromEmployeeName ?? 'Unassigned stock'} <span aria-label="to">→</span> {event.toEmployeeName ?? 'Unassigned stock'}</p><p className="footnote">By {event.actorName} · {event.actorEmail}</p>{event.notes && <p className="history-note">{event.notes}</p>}</li>)}</ol>
    <div className="pagination"><span>{total === 0 ? '0 entries' : `${offset + 1}–${Math.min(offset + 20, total)} of ${total} entries`}</span><div><button className="secondary" onClick={() => void refetch().catch(() => {})}>Refresh</button><button className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</button><button className="secondary" disabled={loading || offset + 20 >= total} onClick={() => setOffset(value => value + 20)}>Next</button></div></div>
  </section>;
}

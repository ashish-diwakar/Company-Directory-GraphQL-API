import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CREATE_EQUIPMENT, INVENTORY, UPDATE_EQUIPMENT } from '../inventory-operations';
import type { EquipmentInput, EquipmentItem, InventoryData } from '../inventory-operations';
import { DIRECTORY } from '../operations';
import { explainError } from '../errors';

const blank: EquipmentInput = { type: '', model: '', serialNumber: '' };
const pageSize = 20;

export function EquipmentInventory() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<{ id?: string; input: EquipmentInput } | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const { data, loading, error, refetch } = useQuery<InventoryData>(INVENTORY, {
    variables: { search, assigned: status === 'all' ? null : status === 'assigned', offset, limit: pageSize },
    fetchPolicy: 'cache-and-network',
  });
  const [create, { loading: creating }] = useMutation<{ createEquipment: EquipmentItem }, { input: EquipmentInput }>(CREATE_EQUIPMENT);
  const [update, { loading: updating }] = useMutation<{ updateEquipment: EquipmentItem }, { id: string; input: EquipmentInput }>(UPDATE_EQUIPMENT);
  const busy = creating || updating;
  const total = data?.equipmentInventory.total ?? 0;
  const items = data?.equipmentInventory.items ?? [];

  function edit(item: EquipmentItem) {
    setEditor({ id: item.id, input: { type: item.type, model: item.model, serialNumber: item.serialNumber } });
    setMessage(undefined);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setMessage(undefined);
    const input = editor.input;
    try {
      if (editor.id) await update({ variables: { id: editor.id, input }, refetchQueries: [INVENTORY, DIRECTORY], awaitRefetchQueries: true });
      else await create({ variables: { input }, refetchQueries: [INVENTORY], awaitRefetchQueries: true });
      setMessage({ error: false, text: editor.id ? 'Device details updated. Its assignment has not changed.' : 'Device added to inventory. It is ready to assign from the directory.' });
      setEditor(null);
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">ASSET MANAGEMENT</p><h1>Equipment inventory</h1><p className="muted">A home for every device, including the ones ready for their next owner.</p></div><button onClick={() => { setEditor({ input: { ...blank } }); setMessage(undefined); }}>+ Add device</button></div>
    {message && <p className={`notice ${message.error ? 'error' : 'success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    {editor && <section className="card inventory-editor"><div className="section-heading"><h2>{editor.id ? 'Edit device' : 'Add a device'}</h2><button className="secondary" disabled={busy} onClick={() => setEditor(null)}>Cancel</button></div><form onSubmit={save}>
      <div className="inventory-fields">{(['type', 'model', 'serialNumber'] as const).map(field => <label key={field}>{field === 'type' ? 'Device type' : field === 'model' ? 'Model' : 'Serial number'}<input autoFocus={field === 'type'} required maxLength={100} value={editor.input[field]} placeholder={field === 'type' ? 'Laptop' : field === 'model' ? 'ThinkPad T14' : 'SN-005'} onChange={event => setEditor({ ...editor, input: { ...editor.input, [field]: event.target.value } })}/></label>)}</div>
      <p className="footnote">Serial numbers are unique and saved in uppercase. Each field accepts up to 100 characters.</p><button disabled={busy}>{busy ? 'Saving…' : editor.id ? 'Save changes' : 'Add device'}</button>
    </form></section>}
    <section className="card"><div className="inventory-toolbar"><label>Search inventory<input maxLength={100} placeholder="Type, model, or serial number" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }}/></label><label>Assignment status<select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="all">All devices</option><option value="available">Unassigned</option><option value="assigned">Assigned</option></select></label><button className="secondary" onClick={() => void refetch().catch(() => {})}>Refresh</button></div>
      {loading && <p role="status">Loading inventory…</p>}{error && <p className="notice error" role="alert">{explainError(error)}</p>}
      {!loading && !error && items.length === 0 && <div className="empty"><p>{search || status !== 'all' ? 'No devices match these filters.' : 'No devices in inventory yet.'}</p><small>{search || status !== 'all' ? 'Try another search or status.' : 'Add your first device using the button above.'}</small></div>}
      {items.length > 0 && <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Device</th><th>Serial number</th><th>Assignment</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.model}</strong><small>{item.type}</small></td><td className="serial">{item.serialNumber}</td><td>{item.assignedTo ? <><span className="badge">ASSIGNED</span><small>{item.assignedTo.name}</small></> : <span className="badge available">UNASSIGNED</span>}</td><td><button className="secondary" aria-label={`Edit ${item.model} ${item.serialNumber}`} onClick={() => edit(item)}>Edit</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>{total === 0 ? '0 devices' : `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total} devices`}</span><div><button className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>Previous</button><button className="secondary" disabled={loading || offset + pageSize >= total} onClick={() => setOffset(value => value + pageSize)}>Next</button></div></div>
    </section><p className="footnote">Assign devices from the Directory. Returns, retirement, and assignment history will be added as separate features.</p>
  </>;
}

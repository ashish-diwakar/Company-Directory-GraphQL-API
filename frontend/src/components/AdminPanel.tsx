import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ASSIGN, DIRECTORY } from '../operations';
import type { Employee, Assignment } from '../operations';
import { explainError } from '../errors';
import { INVENTORY } from '../inventory-operations';
import type { InventoryData } from '../inventory-operations';
export function AdminPanel() {
  const { data } = useQuery<{ employees: Employee[] }>(DIRECTORY);
  const [assign, { loading }] = useMutation<{ assignEquipment: Assignment }, { employeeId: string; equipmentId: string }>(ASSIGN);
  const [employeeId, setEmployee] = useState('');
  const [equipmentId, setEquipment] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { data: inventory, loading: inventoryLoading, error: inventoryError } = useQuery<InventoryData>(INVENTORY, {
    variables: { search, offset, limit: 20 }, fetchPolicy: 'cache-and-network',
  });
  const items = inventory?.equipmentInventory.items ?? [];
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(undefined);
    try {
      const result = await assign({ variables: { employeeId, equipmentId }, refetchQueries: [DIRECTORY, INVENTORY], awaitRefetchQueries: true });
      setMessage({ error: false, text: `${result.data?.assignEquipment.model ?? 'Equipment'} assigned successfully.` });
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  return <section className="card">
    <p className="eyebrow">ASSET MANAGEMENT</p><h2>Assign equipment <span className="badge">ADMIN</span></h2>
    <p className="muted">Move a device to the person who needs it.</p>
    <form onSubmit={submit}>
      <label>Employee<select required value={employeeId} onChange={event => setEmployee(event.target.value)}><option value="">Choose an employee</option>{data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
      <label>Find a device<input maxLength={100} placeholder="Type, model, or serial number" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); setEquipment(''); }}/></label>
      <label>Equipment<select required value={equipmentId} onChange={event => setEquipment(event.target.value)}><option value="">Choose a device</option>{items.map(item => <option key={item.id} value={item.id}>{item.model} · {item.serialNumber}{item.assignedTo ? ` · ${item.assignedTo.name}` : ' · Unassigned'}</option>)}</select></label>
      {inventoryLoading && <p role="status">Loading devices…</p>}
      {inventoryError && <p role="alert" className="notice error">{explainError(inventoryError)}</p>}
      {!inventoryLoading && !inventoryError && items.length === 0 && <p className="footnote">No matching devices. Add devices in Inventory or change your search.</p>}
      <div className="picker-pages"><button type="button" className="secondary" disabled={inventoryLoading || offset === 0} onClick={() => { setOffset(value => Math.max(0, value - 20)); setEquipment(''); }}>Previous</button><button type="button" className="secondary" disabled={inventoryLoading || offset + 20 >= (inventory?.equipmentInventory.total ?? 0)} onClick={() => { setOffset(value => value + 20); setEquipment(''); }}>Next</button></div>
      <button disabled={loading || inventoryLoading || !employeeId || !equipmentId}>{loading ? 'Assigning…' : 'Assign equipment →'}</button>
    </form>
    {message && <p role={message.error ? 'alert' : 'status'} className={`notice ${message.error ? 'error' : 'success'}`}>{message.text}</p>}
    <p className="footnote"><a className="text-link" href="#inventory">Manage equipment inventory →</a></p>
  </section>;
}

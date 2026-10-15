import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ASSIGN, DIRECTORY } from '../operations';
import type { Employee, Assignment } from '../operations';
import { explainError } from '../errors';
export function AdminPanel() {
  const { data } = useQuery<{ employees: Employee[] }>(DIRECTORY);
  const [assign, { loading }] = useMutation<{ assignEquipment: Assignment }, { employeeId: string; equipmentId: string }>(ASSIGN);
  const [employeeId, setEmployee] = useState('');
  const [equipmentId, setEquipment] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const items = Array.from(new Map((data?.employees ?? []).flatMap(employee => employee.assignedEquipment).map(item => [item.id, item])).values());
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(undefined);
    try {
      const result = await assign({ variables: { employeeId, equipmentId }, refetchQueries: [DIRECTORY], awaitRefetchQueries: true });
      setMessage({ error: false, text: `${result.data?.assignEquipment.model ?? 'Equipment'} assigned successfully.` });
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  return <section className="card"><p className="eyebrow">ASSET MANAGEMENT</p><h2>Assign equipment <span className="badge">ADMIN</span></h2><p className="muted">Move a device to the person who needs it.</p><form onSubmit={submit}><label>Employee<select required value={employeeId} onChange={event => setEmployee(event.target.value)}><option value="">Choose an employee</option>{data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Equipment<select value={equipmentId} onChange={event => setEquipment(event.target.value)}><option value="">Choose a device</option>{items.map(item => <option key={item.id} value={item.id}>{item.model} · {item.serialNumber}</option>)}</select></label><label>Equipment UUID<input required value={equipmentId} onChange={event => setEquipment(event.target.value)} placeholder="Or paste an unassigned equipment ID" /></label><button disabled={loading || !employeeId || !equipmentId}>{loading ? 'Assigning…' : 'Assign equipment →'}</button></form>{message && <p role={message.error ? 'alert' : 'status'} className={`notice ${message.error ? 'error' : 'success'}`}>{message.text}</p>}<p className="footnote">Permissions are checked by the server. Employee tokens receive a FORBIDDEN response.</p></section>;
}

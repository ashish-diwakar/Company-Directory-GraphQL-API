import { useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { DIRECTORY } from '../operations';
import type { Employee } from '../operations';
import { explainError } from '../errors';
export function Dashboard() {
  const { data, loading, error, refetch } = useQuery<{ employees: Employee[] }>(DIRECTORY);
  const [search, setSearch] = useState('');
  const employees = data?.employees ?? [];
  const filtered = employees.filter(employee => [employee.name, employee.email, employee.team.name, employee.role].join(' ').toLowerCase().includes(search.toLowerCase()));
  return <section className="card directory"><div className="section-heading"><div><p className="eyebrow">YOUR ORGANIZATION</p><h2>People directory <span className="count">{employees.length}</span></h2></div><button className="secondary" onClick={() => void refetch().catch(() => {})}>Refresh</button></div>
    <label className="search">Search people, roles, or teams<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find someone…" /></label>
    {loading && <p role="status">Loading your directory…</p>}
    {error && <p className="notice error" role="alert">{explainError(error)}</p>}
    <div className="people">{filtered.map(employee => <article className="person" key={employee.id}><div className="person-top"><span className="avatar">{employee.name.split(' ').map(word => word[0]).join('')}</span><div><h3>{employee.name}</h3><p>{employee.role}</p></div></div><a href={`mailto:${employee.email}`}>{employee.email}</a><div className="team"><span>{employee.team.name}</span><small>{employee.team.department}</small></div><div className="assets"><small>ASSIGNED EQUIPMENT · {employee.assignedEquipment.length}</small>{employee.assignedEquipment.length ? employee.assignedEquipment.map(item => <p key={item.id}>{item.model}<span>{item.serialNumber}</span></p>) : <p>No equipment assigned</p>}</div></article>)}</div>
    {!loading && !error && filtered.length === 0 && <p>No people match your search.</p>}
  </section>;
}

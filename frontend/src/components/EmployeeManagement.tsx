import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { EMPLOYEES, TEAMS } from '../employee-operations';
import type { EmployeePage, Team } from '../employee-operations';
import type { Employee } from '../operations';
import { EmployeeEditor } from './EmployeeEditor';
import { explainError } from '../errors';

export function EmployeeManagement() {
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState('');
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<Employee | null | undefined>();
  const [message, setMessage] = useState('');
  const { data, loading, error, refetch } = useQuery<EmployeePage>(EMPLOYEES, { variables: { search, teamId: teamId || null, offset, limit: 20 }, fetchPolicy: 'cache-and-network' });
  const { data: teams, error: teamsError } = useQuery<{ teams: Team[] }>(TEAMS);
  const total = data?.employeeManagement.total ?? 0;
  return <><div className="page-heading"><div><p className="eyebrow">PEOPLE MANAGEMENT</p><h1>Employees</h1><p className="muted">Keep directory details current, and give new colleagues a place in the team.</p></div><button onClick={() => { setEditor(null); setMessage(''); }}>+ Add employee</button></div>
    {message && <p role="status" className="notice success">{message}</p>}
    {editor !== undefined && <EmployeeEditor key={editor?.id ?? 'new'} employee={editor ?? undefined} onCancel={() => setEditor(undefined)} onSaved={() => { setMessage(editor ? 'Employee updated. Assignments and account permissions are unchanged.' : 'Employee created. Link a login account in Accounts when needed.'); setEditor(undefined); }}/>}<section className="card"><div className="inventory-toolbar"><label>Search employees<input maxLength={100} placeholder="Name, email, or job title" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }}/></label><label>Team<select value={teamId} onChange={event => { setTeamId(event.target.value); setOffset(0); }}><option value="">All teams</option>{teams?.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><button className="secondary" onClick={() => void refetch().catch(() => {})}>Refresh</button></div>
      {loading && <p role="status">Loading employees…</p>}{(error || teamsError) && <p className="notice error" role="alert">{explainError(error ?? teamsError)}</p>}
      {!loading && !error && total === 0 && <div className="empty"><p>{search || teamId ? 'No matching employees.' : 'No employees yet.'}</p><small>Add an employee here, or create and link one from Accounts.</small></div>}
      <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Employee</th><th>Job title</th><th>Team</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data?.employeeManagement.items.map(employee => <tr key={employee.id}><td><strong>{employee.name}</strong><small>{employee.email}</small></td><td>{employee.role}</td><td>{employee.team.name}<small>{employee.team.department}</small></td><td><button className="secondary" aria-label={`Edit ${employee.name}`} onClick={() => { setEditor(employee); setMessage(''); }}>Edit</button></td></tr>)}</tbody></table></div>
      {total > 20 && <div className="pagination"><span>Employees {offset + 1}–{Math.min(offset + 20, total)} of {total}</span><div><button className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</button><button className="secondary" disabled={loading || offset + 20 >= total} onClick={() => setOffset(value => value + 20)}>Next</button></div></div>}
      <p className="footnote">Manage login access and employee links in Accounts. Employee deletion/offboarding is a separate future workflow; no record is removed here.</p></section></>;
}

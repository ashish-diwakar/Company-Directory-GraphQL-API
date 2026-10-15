import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CREATE_AND_LINK, CREATE_EMPLOYEE, CREATE_TEAM, EMPLOYEES, TEAMS, UPDATE_EMPLOYEE } from '../employee-operations';
import type { EmployeeInput, Team } from '../employee-operations';
import type { Employee } from '../operations';
import type { Account } from '../auth-operations';
import { ME, USERS } from '../auth-operations';
import { DIRECTORY } from '../operations';
import { explainError } from '../errors';
import { invalidateEmployeeLists } from '../employee-cache';

export function EmployeeEditor({ employee, account, onSaved, onCancel }: {
  employee?: Employee; account?: Account; onSaved: () => void; onCancel: () => void;
}) {
  const [input, setInput] = useState<EmployeeInput>(() => ({ name: employee?.name ?? account?.name ?? '', email: employee?.email ?? account?.email ?? '', role: employee?.role ?? '', teamId: employee?.team.id ?? '' }));
  const [error, setError] = useState('');
  const [showTeam, setShowTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [department, setDepartment] = useState('');
  const { data, loading: teamsLoading, error: teamError } = useQuery<{ teams: Team[] }>(TEAMS);
  const [create, { loading: creating }] = useMutation(CREATE_EMPLOYEE);
  const [update, { loading: updating }] = useMutation(UPDATE_EMPLOYEE);
  const [createLinked, { loading: linking }] = useMutation(CREATE_AND_LINK);
  const [createTeam, { loading: addingTeam }] = useMutation<{ createTeam: Team }, { name: string; department: string }>(CREATE_TEAM);
  const busy = creating || updating || linking || addingTeam;
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const refresh = { update: invalidateEmployeeLists, refetchQueries: [EMPLOYEES, DIRECTORY, TEAMS, USERS, ME], awaitRefetchQueries: true };
      if (employee) await update({ variables: { id: employee.id, input }, ...refresh });
      else if (account) await createLinked({ variables: { userId: account.id, input }, ...refresh });
      else await create({ variables: { input }, ...refresh });
      onSaved();
    } catch (error) { setError(explainError(error)); }
  }
  async function addTeam(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await createTeam({ variables: { name: teamName, department }, refetchQueries: [TEAMS], awaitRefetchQueries: true });
      if (result.data?.createTeam) setInput(previous => ({ ...previous, teamId: result.data!.createTeam.id }));
      setShowTeam(false); setTeamName(''); setDepartment('');
    } catch (error) { setError(explainError(error)); }
  }
  return <section className="card employee-editor"><div className="section-heading"><div><p className="eyebrow">EMPLOYEE DETAILS</p><h2>{employee ? 'Edit employee' : account ? `Create employee for ${account.name}` : 'Add employee'}</h2></div><button className="secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
    {account && <p className="notice success">This creates the directory employee and links it to {account.email} in one step. Account permissions and password will not change.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}{teamError && <p role="alert" className="notice error">{explainError(teamError)}</p>}
    <form onSubmit={save}><div className="employee-fields"><label>Full name<input required maxLength={100} autoComplete="name" value={input.name} onChange={event => setInput({ ...input, name: event.target.value })}/></label><label>Work email<input required type="email" maxLength={254} autoComplete="email" value={input.email} onChange={event => setInput({ ...input, email: event.target.value })}/></label><label>Job title<input required maxLength={100} placeholder="Engineer, Designer, Manager…" value={input.role} onChange={event => setInput({ ...input, role: event.target.value })}/></label><label>Team<select required value={input.teamId} disabled={teamsLoading} onChange={event => setInput({ ...input, teamId: event.target.value })}><option value="">{teamsLoading ? 'Loading teams…' : 'Choose a team'}</option>{data?.teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.department}</option>)}</select></label></div>
      {!teamsLoading && !teamError && data?.teams.length === 0 && <p className="notice">No teams exist yet. Add one below before saving this employee.</p>}
      <p className="footnote">Job title is a directory label, not an admin permission. Editing work email/name does not change the linked login account. Equipment ownership and historical snapshots are preserved.</p><div className="employee-actions"><button disabled={busy || teamsLoading || Boolean(teamError)}>{busy ? 'Saving…' : employee ? 'Save employee' : account ? 'Create and link employee' : 'Create employee'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setShowTeam(value => !value)}>{showTeam ? 'Hide team form' : '+ Add a team'}</button></div></form>
    {showTeam && <form className="new-team-form" onSubmit={addTeam}><h3>Add a team</h3><div className="employee-fields"><label>Team name<input required maxLength={100} value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="Platform"/></label><label>Department<input required maxLength={100} value={department} onChange={event => setDepartment(event.target.value)} placeholder="Engineering"/></label></div><button disabled={busy}>{addingTeam ? 'Adding…' : 'Add team'}</button></form>}
  </section>;
}

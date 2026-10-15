import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@apollo/client/react';
import { CHANGE_PASSWORD, ME, UPDATE_PROFILE } from '../auth-operations';
import type { Account } from '../auth-operations';
import { refreshSession } from '../apollo-client';
import { explainError } from '../errors';
export function AccountSettings({ user }: { user: Account }) {
  const [name, setName] = useState(user.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string }>();
  const [update, { loading: saving }] = useMutation(UPDATE_PROFILE);
  const [password, { loading: changing }] = useMutation(CHANGE_PASSWORD);
  async function profile(event: FormEvent) {
    event.preventDefault(); setMessage(undefined);
    try { await update({ variables: { name }, refetchQueries: [ME], awaitRefetchQueries: true }); setMessage({ error: false, text: 'Your profile has been updated.' }); }
    catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  async function security(event: FormEvent) {
    event.preventDefault(); setMessage(undefined);
    if (next !== confirm) { setMessage({ error: true, text: 'New passwords do not match.' }); return; }
    try {
      await password({ variables: { currentPassword: current, newPassword: next } });
      sessionStorage.setItem('auth-notice', 'Password changed. All sessions have ended. Sign in with your new password.');
      window.location.hash = 'sign-in'; await refreshSession();
    } catch (error) { setMessage({ error: true, text: explainError(error) }); }
  }
  return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE IDENTITY</p><h1>Account settings</h1><p className="muted">Keep your profile current and your account secure.</p></div><span className="badge">{user.role}</span></div>{message && <p role={message.error ? 'alert' : 'status'} className={`notice ${message.error ? 'error' : 'success'}`}>{message.text}</p>}<div className="settings-grid"><section className="card"><h2>Personal details</h2><form onSubmit={profile}><label>Full name<input value={name} required maxLength={100} autoComplete="name" onChange={event => setName(event.target.value)}/></label><label>Email address<input value={user.email} readOnly autoComplete="email"/></label><p className="footnote">Your email is your sign-in identifier. Your role is assigned by the workspace.</p><button disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></form></section><section className="card"><h2>Change password</h2><p className="muted">Changing your password signs you out on every device.</p><form onSubmit={security}><label>Current password<input type="password" required autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)}/></label><label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)}/></label><label>Confirm new password<input type="password" required maxLength={128} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)}/></label><button disabled={changing}>{changing ? 'Updating…' : 'Update password'}</button></form></section></div></>;
}

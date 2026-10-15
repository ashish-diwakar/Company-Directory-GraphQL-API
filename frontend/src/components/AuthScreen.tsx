import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { REGISTER, SIGN_IN, REGISTRATION_OPEN } from '../auth-operations';
import type { AuthPayload } from '../auth-operations';
import { refreshSession } from '../apollo-client';
import { explainError } from '../errors';

export function AuthScreen({ mode }: { mode: 'sign-in' | 'register' | 'help' }) {
  const registering = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('email') ?? '');
  const [invitationToken, setInvitationToken] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('invite') ?? '');
  const { data: setup, loading: setupLoading, error: setupError } = useQuery<{ registrationOpen: boolean }>(REGISTRATION_OPEN, { skip: !registering, fetchPolicy: 'network-only' });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const updateInvitation = () => {
      if (location.hash.slice(1).split('?')[0] !== 'register') return;
      const parameters = new URLSearchParams(location.hash.split('?')[1] ?? '');
      setInvitationToken(parameters.get('invite') ?? ''); setEmail(parameters.get('email') ?? '');
      setPassword(''); setConfirmation(''); setError('');
    };
    window.addEventListener('hashchange', updateInvitation);
    return () => window.removeEventListener('hashchange', updateInvitation);
  }, []);
  const [register] = useMutation<{ register: AuthPayload }, { input: { name: string; email: string; password: string; invitationToken?: string } }>(REGISTER);
  const [signIn] = useMutation<{ signIn: AuthPayload }, { email: string; password: string }>(SIGN_IN);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (registering && password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = registering ? (await register({ variables: { input: { name, email, password, ...(invitationToken ? { invitationToken: invitationToken.trim() } : {}) } } })).data?.register
        : (await signIn({ variables: { email, password } })).data?.signIn;
      if (!result) throw new Error('Unable to start your session. Please try again.');
      window.location.hash = 'directory';
      await refreshSession();
    } catch (error) { setError(explainError(error)); setBusy(false); }
  }
  return <main className="auth-layout"><section className="auth-story"><p className="eyebrow">YOUR PEOPLE. ONE PLACE.</p><h1>Good work starts<br/>with good company.</h1><p className="muted">A shared home for your team, their tools, and everything that keeps work moving.</p><div className="auth-art"><span>AP</span><span>LC</span><span>MS</span><div><strong>Connected by design.</strong><p>People · Teams · Equipment</p></div></div><div className="auth-benefits"><p>01 <strong>A clear view of your organization</strong></p><p>02 <strong>The right access for every person</strong></p><p>03 <strong>Assignment updates as they happen</strong></p></div></section><section className="card auth-card" key={mode}>
    {mode === 'help' ? <><p className="eyebrow">ACCOUNT HELP</p><h2>Need help signing in?</h2><p className="muted">Check your email address and password. Passwords are case-sensitive.</p><p className="muted">Email-based password recovery is not configured for this workspace. If you have lost access, contact the workspace operator. Signed-in users can change their password in Account settings.</p><a className="text-link" href="#sign-in">← Back to sign in</a></> : <><p className="eyebrow">{registering ? 'MAKE YOURSELF AT HOME' : 'WELCOME BACK'}</p><h2>{registering ? 'Create your account' : 'Sign in to your workspace'}</h2><p className="muted">{registering ? 'Join the people behind the work.' : 'Your people and equipment, right where you left them.'}</p>
      {registering && <p className="notice success">{setupLoading ? 'Checking workspace setup…' : setup?.registrationOpen ? 'First-time setup: this account will become the workspace administrator.' : 'This workspace is invitation-only. Use the email and invitation code provided by your administrator.'}</p>}
      {setupError && <p role="alert" className="notice error">{explainError(setupError)}</p>}
      <form onSubmit={submit}>{registering && <label>Full name<input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Alex Morgan"/></label>}<label>Email address<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com"/></label>{registering && !setup?.registrationOpen && <label>Invitation code<input type="password" required maxLength={200} autoComplete="off" value={invitationToken} onChange={event => setInvitationToken(event.target.value)} placeholder="Provided in your invitation link"/></label>}<label>Password<div className="password-field"><input type={visible ? 'text' : 'password'} required minLength={registering ? 12 : undefined} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? 'At least 12 characters' : 'Enter your password'}/><button type="button" className="password-toggle" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button></div></label>{registering && <label>Confirm password<input type={visible ? 'text' : 'password'} required maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Enter your password again"/></label>}
      {error && <p className="notice error" role="alert">{error}</p>}<button disabled={busy || (registering && (setupLoading || Boolean(setupError)))}>{busy ? 'Please wait…' : registering ? 'Create account →' : 'Sign in →'}</button></form>
      {registering ? <p className="footnote">Invitations expire after seven days, work once, and create employee accounts only. Ask an administrator for a new link if yours no longer works.</p> : <a className="text-link" href="#help">Need help signing in?</a>}<p className="auth-switch">{registering ? 'Already have an account?' : 'Have an invitation?'} <a href={registering ? '#sign-in' : '#register'}>{registering ? 'Sign in' : 'Create an account'}</a></p></>}
  </section></main>;
}

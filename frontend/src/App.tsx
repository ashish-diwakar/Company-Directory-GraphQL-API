import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { refreshSession } from './apollo-client';
import { ME, SIGN_OUT } from './auth-operations';
import type { Account } from './auth-operations';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { LiveAlerts } from './components/LiveAlerts';
import { AuthScreen } from './components/AuthScreen';
import { AccountSettings } from './components/AccountSettings';
import { WorkspaceAccounts } from './components/WorkspaceAccounts';
import { EquipmentInventory } from './components/EquipmentInventory';
import { MyEquipment } from './components/MyEquipment';
import { EmployeeManagement } from './components/EmployeeManagement';
import { explainError } from './errors';

export default function App() {
  const [route, setRoute] = useState(() => location.hash.slice(1).split('?')[0] || 'directory');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(() => sessionStorage.getItem('auth-notice') ?? '');
  const { data, loading, error, refetch } = useQuery<{ me: Account | null; sessionExpiresAt: string | null }>(ME, {
    fetchPolicy: 'network-only', pollInterval: 60000,
  });
  const [signOut] = useMutation(SIGN_OUT);
  const user = data?.me;
  useEffect(() => {
    const navigate = () => setRoute(location.hash.slice(1).split('?')[0] || 'directory');
    const synchronize = (event: StorageEvent) => {
      if (event.key === 'session-version' || event.key === null) void refreshSession(false);
    };
    window.addEventListener('hashchange', navigate);
    window.addEventListener('storage', synchronize);
    sessionStorage.removeItem('auth-notice');
    return () => { window.removeEventListener('hashchange', navigate); window.removeEventListener('storage', synchronize); };
  }, []);
  useEffect(() => {
    if (!data?.sessionExpiresAt) return;
    let expires = Date.parse(data.sessionExpiresAt);
    if (!Number.isFinite(expires)) expires = Date.now();
    const timer = setTimeout(() => {
      sessionStorage.setItem('auth-notice', 'Your session has expired. Sign in again.');
      location.hash = 'sign-in'; void refreshSession();
    }, Math.max(0, Math.min(expires - Date.now(), 2147483647)));
    return () => clearTimeout(timer);
  }, [data?.sessionExpiresAt]);
  useEffect(() => {
    if (error && /401|authentication token|Authentication required|Token rejected/i.test(error.message)) {
      sessionStorage.setItem('auth-notice', 'Your session has ended. Please sign in again.');
      location.hash = 'sign-in'; void refreshSession();
    }
  }, [error]);
  async function logout() {
    setBusy(true);
    try { await signOut(); location.hash = 'sign-in'; await refreshSession(); }
    catch (error) { setNotice(explainError(error) + ' Sign-out was not confirmed. Please retry.'); setBusy(false); }
  }
  const protectedRoute = !['sign-in', 'register', 'help'].includes(route);
  const authMode = route === 'register' ? 'register' : route === 'help' ? 'help' : 'sign-in';
  return <><header><a href={user ? '#directory' : '#sign-in'} className="brand"><span className="brand-icon">c.</span>company<span className="brand-divider">/</span><span className="brand-subtitle">workspace</span></a>
    {user ? <nav aria-label="Main navigation"><a className={route === 'directory' ? 'selected' : ''} href="#directory">Directory</a><a className={route === 'my-equipment' ? 'selected' : ''} href="#my-equipment">My equipment</a>{user.role === 'ADMIN' && <a className={route === 'employees' ? 'selected' : ''} href="#employees">Employees</a>}{user.role === 'ADMIN' && <a className={route === 'inventory' ? 'selected' : ''} href="#inventory">Inventory</a>}{user.role === 'ADMIN' && <a className={route === 'accounts' ? 'selected' : ''} href="#accounts">Accounts</a>}<a className={route === 'account' ? 'selected' : ''} href="#account">My account</a><button className="secondary" disabled={busy} onClick={() => void logout()}>{busy ? 'Signing out…' : 'Sign out'}</button></nav> : <span className="environment">YOUR CONNECTED WORKSPACE</span>}
  </header>
    {notice && <div className="page-notice notice success" role="status">{notice}<button className="secondary" onClick={() => setNotice('')}>Dismiss</button></div>}
    {loading && !user ? <main><p role="status">Restoring your session…</p></main> : error ? <main><section className="card"><h2>Unable to restore your session</h2><p role="alert" className="notice error">{explainError(error)}</p><button onClick={() => void refetch().catch(() => {})}>Retry</button><button className="secondary" onClick={() => { location.hash = 'sign-in'; void refreshSession(); }}>Return to sign in</button></section></main> : !user ? <AuthScreen key={authMode} mode={authMode}/> : !protectedRoute ? <main><section className="card"><h2>You are signed in as {user.name}.</h2><p className="muted">Continue to your workspace or sign out to use another account.</p><a className="text-link" href="#directory">Open directory →</a></section></main> : <main>
      {route === 'employees' ? user.role === 'ADMIN' ? <EmployeeManagement/> : <section className="card"><h1>Admin access required</h1><a className="text-link" href="#directory">Return to directory</a></section> : route === 'my-equipment' ? <MyEquipment user={user}/> : route === 'inventory' ? user.role === 'ADMIN' ? <EquipmentInventory/> : <section className="card"><h1>Admin access required</h1><p className="muted">Only administrators can manage inventory.</p><a className="text-link" href="#directory">Return to directory</a></section> : route === 'account' ? <AccountSettings user={user}/> : route === 'accounts' ? user.role === 'ADMIN' ? <WorkspaceAccounts/> : <section className="card"><h1>Admin access required</h1><p className="muted">Your employee account cannot view workspace accounts.</p><a className="text-link" href="#directory">Return to directory</a></section> : route === 'directory' ? <><div className="page-heading"><div><p className="eyebrow">PEOPLE & EQUIPMENT</p><h1>Everything in good company.</h1><p className="muted">Welcome, {user.name}. Your people, their teams, and the tools that keep them moving.</p></div><span className="badge">{user.role}</span></div><div className="layout"><Dashboard user={user}/><aside>{user.role === 'ADMIN' ? <AdminPanel/> : <section className="card"><p className="eyebrow">WORKSPACE ACCESS</p><h2>You are part of the team.</h2><p className="muted">Explore your colleagues and watch live equipment updates. Administrators manage assignments.</p></section>}{(user.role === 'ADMIN' || user.employee) && <LiveAlerts authenticated admin={user.role === 'ADMIN'}/>}</aside></div></> : <section className="card"><h1>Page not found</h1><a className="text-link" href="#directory">Return to directory</a></section>}
      <footer>Company Directory<span>People · Teams · Equipment</span></footer></main>}
  </>;
}

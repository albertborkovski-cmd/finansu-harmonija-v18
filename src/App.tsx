import { useEffect, useState } from 'react';
import { ADMIN_CONTROLS_EVENT, loadAdminControls, loginRestriction, sessionRevoked } from './lib/adminControls';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { supabase } from './lib/supabase';
import { parseSession, resolveSessionForEmail, serializeSession, type AppSession } from './lib/accessControl';
import { AUTH_SESSION_KEY } from './lib/currentUser';
import { recordFailedLogin, recordSuccessfulLogin } from './lib/loginHistory';
import DebtReconciliationPortalView from './components/DebtReconciliationPortalView';

function App() {
  const [notice, setNotice] = useState('');
  const [reminder, setReminder] = useState<{ id: string; message: string } | null>(null);
  const [dismissedReminder, setDismissedReminder] = useState('');
  const [sessionStarted, setSessionStarted] = useState(() => Number(window.localStorage.getItem(`${AUTH_SESSION_KEY}:started`)) || 1);
  const [session, setSession] = useState<AppSession | null>(() => {
    try {
      return parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    } catch {
      return null;
    }
  });

  const handleLogin = (email: string) => {
    const nextSession = resolveSessionForEmail(email);
    if (nextSession.roleNames.includes('Inactive')) { setNotice('This user account is inactive. Please contact your administrator.'); return; }
    const restriction = loginRestriction(loadAdminControls(), nextSession, Date.now());
    if (restriction) { setNotice(restriction); return; }
    const started = Date.now();
    setSessionStarted(started);
    window.localStorage.setItem(`${AUTH_SESSION_KEY}:started`, String(started));
    setNotice('');
    recordSuccessfulLogin(nextSession.email);
    try {
      window.localStorage.setItem(AUTH_SESSION_KEY, serializeSession(nextSession));
    } catch {
      // The in-memory session still works when browser storage is unavailable.
    }
    setSession(nextSession);
  };

  useEffect(() => {
    const check = () => {
      if (!session) { setReminder(null); return; }
      const policy = loadAdminControls();
      const now = Date.now();
      const restriction = loginRestriction(policy, session, now);
      if (restriction || sessionRevoked(policy, session, sessionStarted)) {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        setNotice(restriction || 'Your administrator has ended this session. You can sign in again.');
        setSession(null);
        setReminder(null);
        return;
      }
      const plan = policy.maintenance;
      setReminder(plan && now >= plan.start - plan.reminderMinutes * 60_000 && now < plan.start
        ? { id: plan.id, message: `${plan.message} Sign-out: ${new Date(plan.start).toLocaleString()}. Access resumes: ${new Date(plan.end).toLocaleString()}.` } : null);
    };
    check();
    const timer = window.setInterval(check, 1000);
    window.addEventListener(ADMIN_CONTROLS_EVENT, check);
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener(ADMIN_CONTROLS_EVENT, check); window.removeEventListener('storage', check); window.removeEventListener('focus', check); };
  }, [session, sessionStarted]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      try {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
      } catch {
        // The in-memory session is still cleared when browser storage is unavailable.
      }
      setSession(null);
    }
  };

  if (window.location.pathname.startsWith('/debt-reconciliation/')) {
    return <DebtReconciliationPortalView />;
  }

  if (session) {
    return <>{reminder && dismissedReminder !== reminder.id && <div role="alert" className="fixed right-6 top-5 z-[200] max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-4 font-montserrat text-sm text-[#10233A] shadow-lg"><strong>Scheduled maintenance</strong><p className="my-2">{reminder.message}</p><button className="rounded border border-[#D3E1EC] bg-white px-3 py-1" onClick={() => setDismissedReminder(reminder.id)}>Dismiss</button></div>}<Dashboard session={session} onLogout={handleLogout} /></>;
  }

  return <>{notice && <div role="alert" className="border-b border-amber-300 bg-amber-50 p-4 text-center font-montserrat text-sm">{notice}<button aria-label="Dismiss notice" className="ml-4" onClick={() => setNotice('')}>×</button></div>}<LoginPage onLogin={handleLogin} onLoginFailed={recordFailedLogin} /></>;
}

export default App;

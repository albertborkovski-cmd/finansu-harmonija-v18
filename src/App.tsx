import { useState } from 'react';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { supabase } from './lib/supabase';
import { parseSession, resolveSessionForEmail, serializeSession, type AppSession } from './lib/accessControl';
import { AUTH_SESSION_KEY } from './lib/currentUser';
import { recordFailedLogin, recordSuccessfulLogin } from './lib/loginHistory';
import DebtReconciliationPortalView from './components/DebtReconciliationPortalView';

function App() {
  const [session, setSession] = useState<AppSession | null>(() => {
    try {
      return parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    } catch {
      return null;
    }
  });

  const handleLogin = (email: string) => {
    const nextSession = resolveSessionForEmail(email);
    recordSuccessfulLogin(nextSession.email);
    try {
      window.localStorage.setItem(AUTH_SESSION_KEY, serializeSession(nextSession));
    } catch {
      // The in-memory session still works when browser storage is unavailable.
    }
    setSession(nextSession);
  };

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
    return <Dashboard session={session} onLogout={handleLogout} />;
  }

  return <LoginPage onLogin={handleLogin} onLoginFailed={recordFailedLogin} />;
}

export default App;

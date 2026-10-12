import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from './api.js';
import CustomerView from './CustomerView.jsx';
import Login from './Login.jsx';
import ManagerView from './ManagerView.jsx';
import TellerView from './TellerView.jsx';
import './App.css';

const roleLabels = { customer: 'Customer', teller: 'Bank teller', manager: 'Bank manager' };

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api('/api/me')
      .then(setSession)
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <p className="workspace">Loading…</p>;
  if (!session) return <Login onSuccess={setSession} />;

  const { user } = session;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Northline Bank</h1>
          <p>{user.name} · {roleLabels[user.role]} · {user.channel === 'atm' ? 'ATM' : 'Branch'}</p>
        </div>
        <button className="secondary" type="button" onClick={() => { clearToken(); setSession(null); }}>Log out</button>
      </header>
      {user.role === 'customer' && <CustomerView session={session} onSession={setSession} />}
      {user.role === 'teller' && <TellerView />}
      {user.role === 'manager' && <ManagerView />}
    </div>
  );
}

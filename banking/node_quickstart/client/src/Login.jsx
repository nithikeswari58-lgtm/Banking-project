import { useState } from 'react';
import { api, setToken } from './api.js';

const demos = [
  ['Customer', 'synthetic.customer@example.com', '10000001'],
  ['Customer two', 'synthetic.customer2@example.com', '10000002'],
  ['Teller', 'synthetic.teller@example.com', ''],
  ['Manager', 'synthetic.manager@example.com', ''],
];

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('synthetic.customer@example.com');
  const [password, setPassword] = useState('Test1234!');
  const [channel, setChannel] = useState('branch');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, channel }),
      });
      setToken(result.token);
      onSuccess(await api('/api/me'));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-screen">
      <section className="brand-panel">
        <p className="eyebrow">Learning demo</p>
        <h1>Northline Bank</h1>
        <p>Synthetic accounts for the use case diagram. Nothing here is a real bank.</p>
        <ul>
          <li>Customer and ATM: balance, deposit, and withdraw.</li>
          <li>Branch customer: also transfer and history.</li>
          <li>Teller: open an account and move money.</li>
          <li>Manager: approve a large transfer, close an account, and read reports.</li>
        </ul>
      </section>
      <form className="login-card" onSubmit={submit}>
        <h2>Log in</h2>
        {error && <p className="error">{error}</p>}
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <div className="choice">
          <label>
            <input type="radio" name="channel" checked={channel === 'branch'} onChange={() => setChannel('branch')} />
            Branch
          </label>
          <label>
            <input type="radio" name="channel" checked={channel === 'atm'} onChange={() => setChannel('atm')} />
            ATM
          </label>
        </div>
        <button className="primary" type="submit">Sign in</button>
        <div className="demo">
          Demo password for every user: Test1234!
          {demos.map(([role, address, account]) => (
            <div key={address}>{role}: {address}{account ? ` · account ${account}` : ''}</div>
          ))}
        </div>
      </form>
    </main>
  );
}

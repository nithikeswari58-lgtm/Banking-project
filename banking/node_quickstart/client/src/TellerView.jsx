import { useState } from 'react';
import { api, money } from './api.js';

export default function TellerView() {
  const [name, setName] = useState('Synthetic Fixture001');
  const [email, setEmail] = useState('synthetic.user001@example.com');
  const [password, setPassword] = useState('Test1234!');
  const [openingDeposit, setOpeningDeposit] = useState('100');
  const [accountNumber, setAccountNumber] = useState('10000001');
  const [account, setAccount] = useState(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function openAccount(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await api('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, openingDeposit }),
      });
      setMessage(`Opened account ${result.account.accountNumber} for ${result.account.customerName}.`);
      setAccount(result.account);
      setAccountNumber(result.account.accountNumber);
    } catch (err) {
      setError(err.message);
    }
  }

  async function viewAccount(event) {
    event?.preventDefault();
    setError('');
    try {
      const result = await api(`/api/accounts/${accountNumber}`);
      setAccount(result.account);
    } catch (err) {
      setAccount(null);
      setError(err.message);
    }
  }

  async function move(kind) {
    setError('');
    setMessage('');
    try {
      const result = await api(`/api/accounts/${accountNumber}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      setAccount(result.account);
      setAmount('');
      setMessage(kind === 'deposit' ? 'Deposit recorded.' : 'Withdrawal recorded.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="workspace">
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <section className="grid-2">
        <form className="panel" onSubmit={openAccount}>
          <h2>Open account</h2>
          <label>Customer name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Temporary password<input value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Opening deposit<input value={openingDeposit} onChange={(event) => setOpeningDeposit(event.target.value)} inputMode="decimal" /></label>
          <button className="primary" type="submit">Open account</button>
        </form>
        <form className="panel" onSubmit={viewAccount}>
          <h2>View customer account</h2>
          <label>Account number<input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} /></label>
          <button className="secondary" type="submit">Look up</button>
          {account && (
            <>
              <p className="muted">{account.customerName} · {account.status}</p>
              <p className="balance">{money(account.balance)}</p>
              <label>Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
              <div className="actions">
                <button className="primary" type="button" onClick={() => move('deposit')}>Deposit</button>
                <button className="secondary" type="button" onClick={() => move('withdraw')}>Withdraw</button>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}

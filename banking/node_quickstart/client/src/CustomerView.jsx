import { useEffect, useState } from 'react';
import { api, money } from './api.js';

const typeLabels = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  hold: 'Held for approval',
  refund: 'Refund',
};

export default function CustomerView({ session, onSession }) {
  const atm = session.user.channel === 'atm';
  const [accounts, setAccounts] = useState(session.accounts || []);
  const [accountNumber, setAccountNumber] = useState(session.accounts?.[0]?.accountNumber || '');
  const [amount, setAmount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const account = accounts.find((item) => item.accountNumber === accountNumber);
  const limit = session.transferApprovalLimit;

  async function refresh(nextAccount = accountNumber) {
    const me = await api('/api/me');
    onSession(me);
    setAccounts(me.accounts);
    if (atm || !nextAccount) return;
    const history = await api(`/api/accounts/${nextAccount}/transactions`);
    const mine = await api('/api/transfers/mine');
    setTransactions(history.transactions);
    setTransfers(mine.transfers);
  }

  useEffect(() => {
    if (accountNumber && !toAccount) {
      setToAccount(accountNumber === '10000001' ? '10000002' : '10000001');
    }
  }, [accountNumber, toAccount]);

  useEffect(() => {
    if (!accountNumber || atm) return undefined;
    let ignore = false;
    refresh(accountNumber).catch((err) => {
      if (!ignore) setError(err.message);
    });
    return () => { ignore = true; };
  }, [accountNumber, atm]);

  async function move(kind) {
    setError('');
    setMessage('');
    try {
      await api(`/api/accounts/${accountNumber}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      setMessage(kind === 'deposit' ? 'Deposit recorded.' : 'Withdrawal recorded.');
      setAmount('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendTransfer(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await api('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromAccountNumber: accountNumber,
          toAccountNumber: toAccount,
          amount: transferAmount,
        }),
      });
      setTransferAmount('');
      setMessage(result.status === 'pending'
        ? `Amount is over ${money(limit)}, so a manager must approve it. The funds are held.`
        : 'Transfer completed.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!account) {
    return <section className="panel"><h2>No account yet</h2><p>A teller has to open an account before this customer can bank.</p></section>;
  }

  return (
    <div className="workspace">
      {atm && <p className="notice">ATM channel. Transfer and transaction history stay at the branch.</p>}
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <section className="panel">
        <h2>View balance</h2>
        {accounts.length > 1 && (
          <label>
            Account
            <select value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)}>
              {accounts.map((item) => (
                <option key={item.accountNumber} value={item.accountNumber}>{item.accountNumber}</option>
              ))}
            </select>
          </label>
        )}
        <p className="muted">Account {account.accountNumber} · {account.status}</p>
        <p className="balance">{money(account.balance)}</p>
      </section>
      <section className="grid-2">
        <form className="panel" onSubmit={(event) => { event.preventDefault(); move('deposit'); }}>
          <h2>Deposit funds</h2>
          <label>
            Amount
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
          </label>
          <div className="actions">
            <button className="primary" type="submit">Deposit</button>
            <button className="secondary" type="button" onClick={() => move('withdraw')}>Withdraw</button>
          </div>
        </form>
        {!atm && (
          <form className="panel" onSubmit={sendTransfer}>
            <h2>Transfer funds</h2>
            <p className="muted">The transfer always checks the balance. Over {money(limit)} waits for a manager.</p>
            <label>
              Destination account
              <input value={toAccount} onChange={(event) => setToAccount(event.target.value)} />
            </label>
            <label>
              Amount
              <input value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} inputMode="decimal" />
            </label>
            <button className="primary" type="submit">Transfer</button>
          </form>
        )}
      </section>
      {!atm && (
        <section className="grid-2">
          <div className="panel">
            <h2>Transaction history</h2>
            <table>
              <thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{typeLabels[row.type] || row.type}</td>
                    <td>{money(row.amount)}</td>
                    <td>{money(row.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h2>Transfers</h2>
            <table>
              <thead><tr><th>To</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {transfers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.toAccountNumber}</td>
                    <td>{money(row.amount)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

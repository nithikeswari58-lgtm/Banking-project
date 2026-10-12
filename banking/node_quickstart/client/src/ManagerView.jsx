import { useEffect, useState } from 'react';
import { api, money } from './api.js';

export default function ManagerView() {
  const [report, setReport] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [accountNumber, setAccountNumber] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const [reportResult, pendingResult] = await Promise.all([
      api('/api/reports'),
      api('/api/transfers/pending'),
    ]);
    setReport(reportResult.report);
    setTransfers(pendingResult.transfers);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function settle(id, action) {
    setError('');
    setMessage('');
    try {
      await api(`/api/transfers/${id}/${action}`, { method: 'POST' });
      setMessage(action === 'approve' ? 'Transfer approved and paid to the destination.' : 'Transfer rejected and the hold was returned.');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function close(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await api(`/api/accounts/${accountNumber}/close`, { method: 'POST' });
      setMessage(`Account ${result.account.accountNumber} is closed.`);
      setAccountNumber('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="workspace">
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <section className="stats">
        <article className="stat"><h2>Open accounts</h2><strong>{report?.openAccounts ?? '—'}</strong></article>
        <article className="stat"><h2>Closed accounts</h2><strong>{report?.closedAccounts ?? '—'}</strong></article>
        <article className="stat"><h2>Balances</h2><strong>{report ? money(report.totalBalances) : '—'}</strong></article>
        <article className="stat"><h2>Waiting approval</h2><strong>{report?.pendingTransfers ?? '—'}</strong></article>
      </section>
      <section className="grid-2">
        <div className="panel">
          <h2>Approve large transfer</h2>
          <p className="muted">This is the extend path. It runs only after a customer transfer is over the limit.</p>
          <table>
            <thead><tr><th>From</th><th>To</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {transfers.length === 0 && <tr><td colSpan="4">No transfers are waiting.</td></tr>}
              {transfers.map((row) => (
                <tr key={row.id}>
                  <td>{row.fromAccountNumber}</td>
                  <td>{row.toAccountNumber}</td>
                  <td>{money(row.amount)}</td>
                  <td className="actions">
                    <button className="primary" type="button" onClick={() => settle(row.id, 'approve')}>Approve</button>
                    <button className="danger" type="button" onClick={() => settle(row.id, 'reject')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="panel" onSubmit={close}>
          <h2>Close account</h2>
          <p className="muted">The balance must already be zero, and no transfer can still be pending.</p>
          <label>Account number<input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} /></label>
          <button className="danger" type="submit">Close account</button>
          {report && (
            <p className="muted">
              Deposits {money(report.deposits)} · Withdrawals {money(report.withdrawals)} · Completed transfers out {money(report.completedTransferOut)}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

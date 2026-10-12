import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { ensureIndexes, getDb } from './db.js';
import { blockAtm, requireAuth, requireRole, signToken } from './auth.js';
import { dollarsToCents, TRANSFER_APPROVAL_LIMIT_CENTS, centsToDollars } from './money.js';
import {
  approveTransfer,
  buildReport,
  closeAccount,
  deposit,
  listPendingTransfers,
  listTransfersForAccounts,
  openAccount,
  publicAccount,
  rejectTransfer,
  transactionHistory,
  transfer,
  viewBalance,
  withdraw,
} from './banking.js';

const app = express();
app.use(cors());
app.use(express.json());

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function ownAccountOrStaff(req, accountNumber) {
  const db = await getDb();
  const account = await viewBalance(db, accountNumber);
  if (req.user.role === 'customer' && account.customerId.toString() !== req.user.sub) {
    const error = new Error('That is not your account.');
    error.status = 403;
    throw error;
  }
  return { db, account };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({ transferApprovalLimit: centsToDollars(TRANSFER_APPROVAL_LIMIT_CENTS) });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const channel = req.body.channel === 'atm' ? 'atm' : 'branch';
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  const matches = user && await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  if (channel === 'atm' && user.role !== 'customer') {
    res.status(403).json({ error: 'Only a customer can use the ATM.' });
    return;
  }
  const token = signToken(user, channel);
  res.json({
    token,
    user: { name: user.name, email: user.email, role: user.role, channel },
  });
}));

app.get('/api/me', requireAuth, asyncRoute(async (req, res) => {
  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.sub) });
  if (!user) {
    res.status(401).json({ error: 'Log in again.' });
    return;
  }
  const accounts = await db.collection('accounts').find({ customerId: user._id }).sort({ accountNumber: 1 }).toArray();
  res.json({
    user: { name: user.name, email: user.email, role: user.role, channel: req.user.channel },
    accounts: accounts.map(publicAccount),
    transferApprovalLimit: centsToDollars(TRANSFER_APPROVAL_LIMIT_CENTS),
  });
}));

app.get('/api/accounts/:accountNumber', requireAuth, asyncRoute(async (req, res) => {
  const { account } = await ownAccountOrStaff(req, req.params.accountNumber);
  res.json({ account: publicAccount(account) });
}));

app.get('/api/accounts/:accountNumber/transactions', requireAuth, blockAtm, asyncRoute(async (req, res) => {
  const { db } = await ownAccountOrStaff(req, req.params.accountNumber);
  const transactions = await transactionHistory(db, req.params.accountNumber);
  res.json({ transactions });
}));

app.post('/api/accounts', requireAuth, requireRole('teller'), asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (name.length < 2) {
    res.status(400).json({ error: 'Enter the customer name.' });
    return;
  }
  if (!email.includes('@')) {
    res.status(400).json({ error: 'Enter a customer email.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Use a temporary password of at least 8 characters.' });
    return;
  }
  const openingDepositCents = dollarsToCents(req.body.openingDeposit);
  const db = await getDb();
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await openAccount(db, { name, email, passwordHash, openingDepositCents });
  res.status(201).json({ account: publicAccount(account) });
}));

app.post('/api/accounts/:accountNumber/deposit', requireAuth, requireRole('customer', 'teller'), asyncRoute(async (req, res) => {
  const { db } = await ownAccountOrStaff(req, req.params.accountNumber);
  const updated = await deposit(db, req.params.accountNumber, dollarsToCents(req.body.amount));
  res.json({ account: publicAccount(updated) });
}));

app.post('/api/accounts/:accountNumber/withdraw', requireAuth, requireRole('customer', 'teller'), asyncRoute(async (req, res) => {
  const { db } = await ownAccountOrStaff(req, req.params.accountNumber);
  const updated = await withdraw(db, req.params.accountNumber, dollarsToCents(req.body.amount));
  res.json({ account: publicAccount(updated) });
}));

app.post('/api/accounts/:accountNumber/close', requireAuth, requireRole('manager'), asyncRoute(async (req, res) => {
  const db = await getDb();
  const account = await closeAccount(db, req.params.accountNumber);
  res.json({ account: publicAccount(account) });
}));

app.post('/api/transfers', requireAuth, requireRole('customer'), blockAtm, asyncRoute(async (req, res) => {
  const { db, account } = await ownAccountOrStaff(req, req.body.fromAccountNumber);
  const result = await transfer(db, {
    fromAccountNumber: account.accountNumber,
    toAccountNumber: req.body.toAccountNumber,
    amountCents: dollarsToCents(req.body.amount),
  });
  res.status(201).json(result);
}));

app.get('/api/transfers/mine', requireAuth, requireRole('customer'), blockAtm, asyncRoute(async (req, res) => {
  const db = await getDb();
  const accounts = await db.collection('accounts')
    .find({ customerId: new ObjectId(req.user.sub) })
    .toArray();
  const transfers = await listTransfersForAccounts(db, accounts.map((account) => account.accountNumber));
  res.json({ transfers });
}));

app.get('/api/transfers/pending', requireAuth, requireRole('manager'), asyncRoute(async (req, res) => {
  const db = await getDb();
  const transfers = await listPendingTransfers(db);
  res.json({ transfers });
}));

app.post('/api/transfers/:id/approve', requireAuth, requireRole('manager'), asyncRoute(async (req, res) => {
  const db = await getDb();
  const result = await approveTransfer(db, req.params.id);
  res.json(result);
}));

app.post('/api/transfers/:id/reject', requireAuth, requireRole('manager'), asyncRoute(async (req, res) => {
  const db = await getDb();
  const result = await rejectTransfer(db, req.params.id);
  res.json(result);
}));

app.get('/api/reports', requireAuth, requireRole('manager'), asyncRoute(async (req, res) => {
  const db = await getDb();
  res.json({ report: await buildReport(db) });
}));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status === 500) {
    console.error(error);
  }
  res.status(status).json({
    error: status === 500 ? 'Something went wrong.' : error.message,
  });
});

const port = Number(process.env.PORT) || 3001;
const db = await getDb();
await ensureIndexes(db);
app.listen(port, () => {
  console.log(`Banking API listening on ${port}`);
});

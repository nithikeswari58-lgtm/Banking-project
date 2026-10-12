import { ObjectId } from 'mongodb';
import { getClient } from './db.js';
import { TRANSFER_APPROVAL_LIMIT_CENTS, centsToDollars, httpError } from './money.js';

export function publicAccount(account) {
  return {
    accountNumber: account.accountNumber,
    customerName: account.customerName,
    balance: centsToDollars(account.balanceCents),
    status: account.status,
  };
}

export function publicTransaction(transaction) {
  return {
    id: transaction._id.toString(),
    accountNumber: transaction.accountNumber,
    type: transaction.type,
    amount: centsToDollars(transaction.amountCents),
    balanceAfter: centsToDollars(transaction.balanceAfterCents),
    note: transaction.note || '',
    status: transaction.status,
    createdAt: transaction.createdAt,
  };
}

export function publicTransfer(transfer) {
  return {
    id: transfer._id.toString(),
    fromAccountNumber: transfer.fromAccountNumber,
    toAccountNumber: transfer.toAccountNumber,
    amount: centsToDollars(transfer.amountCents),
    status: transfer.status,
    createdAt: transfer.createdAt,
  };
}

// UML «include»: transfer and every balance screen call this same read.
export async function viewBalance(db, accountNumber, session) {
  const account = await db.collection('accounts').findOne(
    { accountNumber: String(accountNumber).trim() },
    { session }
  );
  if (!account) {
    throw httpError(404, 'Account not found.');
  }
  return account;
}

async function nextAccountNumber(db, session) {
  const updated = await db.collection('counters').findOneAndUpdate(
    { _id: 'accountNumber' },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', session }
  );
  const seq = updated?.seq ?? updated?.value?.seq;
  if (!seq) {
    throw httpError(500, 'Could not assign an account number.');
  }
  return String(10000000 + seq);
}

async function withSession(work) {
  const session = (await getClient()).startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function openAccount(db, { name, email, passwordHash, openingDepositCents }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.collection('users').findOne({ email: normalizedEmail });
  if (existing) {
    throw httpError(409, 'A customer with that email already exists.');
  }
  await db.collection('counters').updateOne(
    { _id: 'accountNumber' },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );

  return withSession(async (session) => {
    const userResult = await db.collection('users').insertOne({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'customer',
      createdAt: new Date(),
    }, { session });

    const accountNumber = await nextAccountNumber(db, session);
    const account = {
      accountNumber,
      customerId: userResult.insertedId,
      customerName: name.trim(),
      balanceCents: openingDepositCents,
      status: 'open',
      createdAt: new Date(),
    };
    await db.collection('accounts').insertOne(account, { session });

    if (openingDepositCents > 0) {
      await db.collection('transactions').insertOne({
        accountNumber,
        type: 'deposit',
        amountCents: openingDepositCents,
        balanceAfterCents: openingDepositCents,
        note: 'Opening deposit',
        status: 'completed',
        createdAt: new Date(),
      }, { session });
    }

    return account;
  });
}

export async function deposit(db, accountNumber, amountCents) {
  return changeBalance(db, accountNumber, amountCents, 'deposit', 'Deposit');
}

export async function withdraw(db, accountNumber, amountCents) {
  return changeBalance(db, accountNumber, -amountCents, 'withdrawal', 'Withdrawal');
}

async function changeBalance(db, accountNumber, deltaCents, type, note) {
  return withSession(async (session) => {
    const account = await viewBalance(db, accountNumber, session);
    if (account.status !== 'open') {
      throw httpError(400, 'This account is closed.');
    }
    const nextBalance = account.balanceCents + deltaCents;
    if (nextBalance < 0) {
      throw httpError(400, 'Not enough balance.');
    }
    await db.collection('accounts').updateOne(
      { _id: account._id },
      { $set: { balanceCents: nextBalance } },
      { session }
    );
    await db.collection('transactions').insertOne({
      accountNumber: account.accountNumber,
      type,
      amountCents: Math.abs(deltaCents),
      balanceAfterCents: nextBalance,
      note,
      status: 'completed',
      createdAt: new Date(),
    }, { session });
    return { ...account, balanceCents: nextBalance };
  });
}

// UML «include» View balance, then «extend» Approve large transfer when over the limit.
export async function transfer(db, { fromAccountNumber, toAccountNumber, amountCents }) {
  if (String(fromAccountNumber) === String(toAccountNumber)) {
    throw httpError(400, 'Choose a different destination account.');
  }

  return withSession(async (session) => {
    const source = await viewBalance(db, fromAccountNumber, session);
    const destination = await viewBalance(db, toAccountNumber, session);
    if (source.status !== 'open' || destination.status !== 'open') {
      throw httpError(400, 'Both accounts must be open.');
    }
    if (source.balanceCents < amountCents) {
      throw httpError(400, 'Not enough balance.');
    }

    const sourceAfter = source.balanceCents - amountCents;
    await db.collection('accounts').updateOne(
      { _id: source._id },
      { $set: { balanceCents: sourceAfter } },
      { session }
    );

    const needsApproval = amountCents > TRANSFER_APPROVAL_LIMIT_CENTS;
    const transferDoc = {
      fromAccountNumber: source.accountNumber,
      toAccountNumber: destination.accountNumber,
      amountCents,
      status: needsApproval ? 'pending' : 'completed',
      createdAt: new Date(),
    };
    const inserted = await db.collection('transfers').insertOne(transferDoc, { session });

    if (needsApproval) {
      await db.collection('transactions').insertOne({
        accountNumber: source.accountNumber,
        type: 'hold',
        amountCents,
        balanceAfterCents: sourceAfter,
        note: 'Held until a manager approves the transfer',
        status: 'pending',
        transferId: inserted.insertedId,
        createdAt: new Date(),
      }, { session });
      return {
        status: 'pending',
        id: inserted.insertedId.toString(),
        balance: centsToDollars(sourceAfter),
      };
    }

    const destinationAfter = destination.balanceCents + amountCents;
    await db.collection('accounts').updateOne(
      { _id: destination._id },
      { $set: { balanceCents: destinationAfter } },
      { session }
    );
    const now = new Date();
    await db.collection('transactions').insertMany([
      {
        accountNumber: source.accountNumber,
        type: 'transfer_out',
        amountCents,
        balanceAfterCents: sourceAfter,
        note: `Transfer to ${destination.accountNumber}`,
        status: 'completed',
        transferId: inserted.insertedId,
        createdAt: now,
      },
      {
        accountNumber: destination.accountNumber,
        type: 'transfer_in',
        amountCents,
        balanceAfterCents: destinationAfter,
        note: `Transfer from ${source.accountNumber}`,
        status: 'completed',
        transferId: inserted.insertedId,
        createdAt: now,
      },
    ], { session });

    return {
      status: 'completed',
      id: inserted.insertedId.toString(),
      balance: centsToDollars(sourceAfter),
    };
  });
}

export async function approveTransfer(db, transferId) {
  return settleTransfer(db, transferId, true);
}

export async function rejectTransfer(db, transferId) {
  return settleTransfer(db, transferId, false);
}

async function settleTransfer(db, transferId, approved) {
  if (!ObjectId.isValid(transferId)) {
    throw httpError(400, 'Unknown transfer.');
  }
  return withSession(async (session) => {
    const transfer = await db.collection('transfers').findOne(
      { _id: new ObjectId(transferId), status: 'pending' },
      { session }
    );
    if (!transfer) {
      throw httpError(404, 'That transfer is not waiting for approval.');
    }

    if (approved) {
      const destination = await viewBalance(db, transfer.toAccountNumber, session);
      if (destination.status !== 'open') {
        throw httpError(400, 'The destination account is closed.');
      }
      const destinationAfter = destination.balanceCents + transfer.amountCents;
      await db.collection('accounts').updateOne(
        { _id: destination._id },
        { $set: { balanceCents: destinationAfter } },
        { session }
      );
      await db.collection('transactions').insertOne({
        accountNumber: destination.accountNumber,
        type: 'transfer_in',
        amountCents: transfer.amountCents,
        balanceAfterCents: destinationAfter,
        note: `Approved transfer from ${transfer.fromAccountNumber}`,
        status: 'completed',
        transferId: transfer._id,
        createdAt: new Date(),
      }, { session });
      await db.collection('transactions').updateOne(
        { transferId: transfer._id, type: 'hold' },
        { $set: { status: 'completed', note: `Transfer to ${destination.accountNumber} approved` } },
        { session }
      );
    } else {
      const source = await viewBalance(db, transfer.fromAccountNumber, session);
      const sourceAfter = source.balanceCents + transfer.amountCents;
      await db.collection('accounts').updateOne(
        { _id: source._id },
        { $set: { balanceCents: sourceAfter } },
        { session }
      );
      await db.collection('transactions').insertOne({
        accountNumber: source.accountNumber,
        type: 'refund',
        amountCents: transfer.amountCents,
        balanceAfterCents: sourceAfter,
        note: 'Manager rejected the transfer',
        status: 'completed',
        transferId: transfer._id,
        createdAt: new Date(),
      }, { session });
      await db.collection('transactions').updateOne(
        { transferId: transfer._id, type: 'hold' },
        { $set: { status: 'reversed' } },
        { session }
      );
    }

    await db.collection('transfers').updateOne(
      { _id: transfer._id },
      { $set: { status: approved ? 'completed' : 'rejected', settledAt: new Date() } },
      { session }
    );
    return { status: approved ? 'completed' : 'rejected' };
  });
}

export async function closeAccount(db, accountNumber) {
  return withSession(async (session) => {
    const account = await viewBalance(db, accountNumber, session);
    if (account.status === 'closed') {
      throw httpError(400, 'This account is already closed.');
    }
    if (account.balanceCents !== 0) {
      throw httpError(400, 'The balance must be zero before the account can close.');
    }
    const pending = await db.collection('transfers').countDocuments(
      {
        status: 'pending',
        $or: [
          { fromAccountNumber: account.accountNumber },
          { toAccountNumber: account.accountNumber },
        ],
      },
      { session }
    );
    if (pending > 0) {
      throw httpError(400, 'Finish pending transfers before closing this account.');
    }
    await db.collection('accounts').updateOne(
      { _id: account._id },
      { $set: { status: 'closed', closedAt: new Date() } },
      { session }
    );
    return { ...account, status: 'closed' };
  });
}

export async function transactionHistory(db, accountNumber) {
  await viewBalance(db, accountNumber);
  const rows = await db.collection('transactions')
    .find({ accountNumber: String(accountNumber) })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return rows.map(publicTransaction);
}

export async function listPendingTransfers(db) {
  const rows = await db.collection('transfers').find({ status: 'pending' }).sort({ createdAt: 1 }).toArray();
  return rows.map(publicTransfer);
}

export async function listTransfersForAccounts(db, accountNumbers) {
  const rows = await db.collection('transfers')
    .find({ fromAccountNumber: { $in: accountNumbers } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return rows.map(publicTransfer);
}

export async function buildReport(db) {
  const accounts = await db.collection('accounts').find().toArray();
  const transactions = await db.collection('transactions').find().toArray();
  const pendingTransfers = await db.collection('transfers').countDocuments({ status: 'pending' });

  const sumType = (type) => transactions
    .filter((row) => row.type === type && row.status !== 'reversed')
    .reduce((sum, row) => sum + row.amountCents, 0);

  const openAccounts = accounts.filter((account) => account.status === 'open');
  return {
    openAccounts: openAccounts.length,
    closedAccounts: accounts.length - openAccounts.length,
    totalBalances: centsToDollars(openAccounts.reduce((sum, account) => sum + account.balanceCents, 0)),
    pendingTransfers,
    deposits: centsToDollars(sumType('deposit')),
    withdrawals: centsToDollars(sumType('withdrawal')),
    completedTransferOut: centsToDollars(sumType('transfer_out')),
    heldTransfers: centsToDollars(sumType('hold')),
  };
}

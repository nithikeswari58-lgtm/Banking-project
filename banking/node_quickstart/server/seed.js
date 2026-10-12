import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { ensureIndexes, getDb } from './db.js';

const demoPassword = 'Test1234!';

const customers = [
  {
    name: 'Synthetic Customer',
    email: 'synthetic.customer@example.com',
    accountNumber: '10000001',
    balanceCents: 250_000,
  },
  {
    name: 'Synthetic Customer Two',
    email: 'synthetic.customer2@example.com',
    accountNumber: '10000002',
    balanceCents: 80_000,
  },
];

const db = await getDb();
await ensureIndexes(db);

const alreadySeeded = await db.collection('users').findOne({ email: 'synthetic.teller@example.com' });
if (alreadySeeded) {
  console.log('Demo banking data is already loaded.');
  process.exit(0);
}

const passwordHash = await bcrypt.hash(demoPassword, 10);
const now = new Date();

const staff = await db.collection('users').insertMany([
  { name: 'Synthetic Teller', email: 'synthetic.teller@example.com', passwordHash, role: 'teller', createdAt: now },
  { name: 'Synthetic Manager', email: 'synthetic.manager@example.com', passwordHash, role: 'manager', createdAt: now },
]);

const customerUsers = await db.collection('users').insertMany(customers.map((customer) => ({
  name: customer.name,
  email: customer.email,
  passwordHash,
  role: 'customer',
  createdAt: now,
})));

await db.collection('accounts').insertMany(customers.map((customer, index) => ({
  accountNumber: customer.accountNumber,
  customerId: customerUsers.insertedIds[index],
  customerName: customer.name,
  balanceCents: customer.balanceCents,
  status: 'open',
  createdAt: now,
})));

await db.collection('transactions').insertMany(customers.map((customer) => ({
  accountNumber: customer.accountNumber,
  type: 'deposit',
  amountCents: customer.balanceCents,
  balanceAfterCents: customer.balanceCents,
  note: 'Opening deposit',
  status: 'completed',
  createdAt: now,
})));

await db.collection('counters').updateOne(
  { _id: 'accountNumber' },
  { $set: { seq: customers.length } },
  { upsert: true }
);

console.log(`Loaded demo users. Teller id prefix ${String(staff.insertedIds[0]).slice(0, 4)}.`);
process.exit(0);

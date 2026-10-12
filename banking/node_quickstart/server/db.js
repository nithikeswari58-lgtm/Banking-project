import { MongoClient } from 'mongodb';

let client;

export async function getClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI.');
  }
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }
  return client;
}

export async function getDb() {
  const connected = await getClient();
  return connected.db('banking');
}

export async function ensureIndexes(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('accounts').createIndex({ accountNumber: 1 }, { unique: true });
  await db.collection('accounts').createIndex({ customerId: 1 });
  await db.collection('transfers').createIndex({ status: 1 });
}

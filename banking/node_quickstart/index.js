import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function runGetStarted() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI. Copy .env.example to .env and set the connection string.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    const database = client.db('sample_mflix');
    const movies = database.collection('movies');
    const query = { title: 'Back to the Future' };
    const movie = await movies.findOne(query);
    console.log(movie);
  } finally {
    await client.close();
  }
}

runGetStarted().catch(console.dir);

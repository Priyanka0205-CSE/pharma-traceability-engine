import { MongoClient } from "mongodb";

// Lazy connection so the app still works if MongoDB is not running.
const g = globalThis;
export async function getMongoDb() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  if (!g.mongoClientPromise) {
    g.mongoClientPromise = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 2000,
    }).connect();
  }
  const client = await g.mongoClientPromise;
  return client.db();
}

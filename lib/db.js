import { Pool } from "pg";

// One shared pool. Credentials come ONLY from environment variables.
const globalForPg = globalThis;
export const pool =
  globalForPg.pgPool || new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export const query = (text, params) => pool.query(text, params);

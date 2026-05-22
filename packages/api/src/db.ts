import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@berg/shared';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 20,        // connection pool ceiling; raise if stress tests show exhaustion
  prepare: false, // required for Supabase pgbouncer (transaction mode)
  ssl: 'require',
});

export const db = drizzle(client, { schema });
export type DB = typeof db;

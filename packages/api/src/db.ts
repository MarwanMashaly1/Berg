import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@berg/shared';

const connectionString = process.env.DATABASE_URL!;

export const client = postgres(connectionString, {
  max:             20,      // pool ceiling; raise if stress tests show exhaustion
  prepare:         false,   // required for Supabase pgbouncer (transaction mode)
  ssl:             'require',
  idle_timeout:    30,      // close idle connections after 30s
  connect_timeout: 10,      // fail fast if pool can't get a connection
});

export const db = drizzle(client, { schema });
export type DB = typeof db;

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@berg/shared';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  prepare: false,
  ssl: 'require',
});

export const db = drizzle(client, { schema });
export type DB = typeof db;

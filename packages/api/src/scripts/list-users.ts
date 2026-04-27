import 'dotenv/config';
import { db } from '../db.js';
import { users } from '@berg/shared';

async function main() {
  const allUsers = await db.select().from(users);
  console.log(JSON.stringify(allUsers, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// pg-boss v12 is pure ESM. tsx's CJS transform mangles direct imports.
// The .mjs bridge forces Node to load it as ESM regardless of tsx's transform,
// so the named export PgBoss is always the real constructor.

import { log } from './logger.js';

type PgBossInstance = Awaited<ReturnType<typeof makeBoss>>;

async function makeBoss() {
  const { PgBoss } = await import('./pg-boss-esm.mjs') as { PgBoss: any };
  return new PgBoss({
    connectionString: process.env.QUEUE_DATABASE_URL ?? process.env.DATABASE_URL!,
    schema: 'pgboss',
    deleteAfterDays: 3,
    archiveFailedAfterSeconds: 60 * 60 * 24 * 7,
  });
}

let boss: PgBossInstance | null = null;

export async function getQueue(): Promise<PgBossInstance> {
  if (!boss) {
    boss = await makeBoss();
    boss.on('error', (err: unknown) => {
      log.error({ err }, 'queue pg-boss error');
    });
    await boss.start();
    log.info('queue pg-boss started');
  }
  return boss;
}

export async function enqueue(name: string, data: Record<string, unknown>): Promise<void> {
  const q = await getQueue();
  await q.send(name, data);
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}

export async function enqueueAt(
  name: string,
  data: Record<string, unknown>,
  runAt: Date,
): Promise<void> {
  if (runAt.getTime() <= Date.now()) {
    await enqueue(name, data);
    return;
  }
  const q = await getQueue();
  await q.send(name, data, { startAfter: runAt });
}

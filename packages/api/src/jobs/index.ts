import { getQueue } from '../lib/queue.js';
import { handlePromptMatch } from './prompt-match.js';
import { handleMotiveReminder } from './motive-reminder.js';
import { handleMotiveMemoryPrompt } from './motive-memory-prompt.js';
import { handleMotiveResurface } from './motive-resurface.js';
import { handleRecomputeFofUser, handleRecomputeFofAll } from './recompute-fof.js';
import { handleGeneratePrompts } from './generate-prompts.js';
import { handleSelectDailyPrompt } from './select-daily-prompt.js';
import { handleMotiveAutoArchive } from './motive-auto-archive.js';
import { log } from '../lib/logger.js';

/**
 * Register all pg-boss workers and cron jobs. Called once at server startup.
 * Each worker polls its queue and processes jobs as they become available or reach their run time.
 */
export async function startWorkers(): Promise<void> {
  const boss = await getQueue();

  // pg-boss v12 requires queues to exist before work() or schedule()
  const queues = [
    'prompt/new-response',
    'motive/reminder',
    'motive/memory-prompt',
    'motive/resurface',
    'discovery/recompute-fof-user',
    'discovery/recompute-fof-all',
    'prompts/generate-batch',
    'prompts/select-daily',
    'motive/auto-archive',
  ];
  await Promise.all(queues.map((q) => boss.createQueue(q)));

  // ── Notification jobs ─────────────────────────────────────────────────────

  // N8 + N9: prompt match — can receive many at once during peak hours
  await boss.work(
    'prompt/new-response',
    { teamSize: 10, teamConcurrency: 5 },
    async (jobs: any[]) => { await Promise.allSettled(jobs.map(handlePromptMatch)); },
  );

  // N10: motive 2h reminder
  await boss.work(
    'motive/reminder',
    { teamSize: 5, teamConcurrency: 2 },
    async (jobs: any[]) => { await Promise.allSettled(jobs.map(handleMotiveReminder)); },
  );

  // N11: post-motive memory prompt
  await boss.work(
    'motive/memory-prompt',
    { teamSize: 5, teamConcurrency: 2 },
    async (jobs: any[]) => { await Promise.allSettled(jobs.map(handleMotiveMemoryPrompt)); },
  );

  // N12: memory resurfacing T+14
  await boss.work(
    'motive/resurface',
    { teamSize: 5, teamConcurrency: 2 },
    async (jobs: any[]) => { await Promise.allSettled(jobs.map(handleMotiveResurface)); },
  );

  // ── Discovery / suggestions jobs ──────────────────────────────────────────

  // Immediate recompute for a single user (triggered on connection accept / vibe tag update)
  await boss.work(
    'discovery/recompute-fof-user',
    { teamSize: 10, teamConcurrency: 5 },
    async (jobs: any[]) => { await Promise.allSettled(jobs.map(handleRecomputeFofUser)); },
  );

  // [align-3] Daily cron PAUSED — too few users for batch FOF to produce useful output.
  // FOF is now computed on-demand when a user views their suggestions screen.
  // Re-enable when user count > 100 in a single locality. See PRODUCT_NORTH_STAR.md.
  //
  // await boss.schedule(
  //   'discovery/recompute-fof-all',
  //   '0 3 * * *',   // 3am UTC daily
  //   {},
  // );

  // Worker registration stays — on-demand triggers via discovery/recompute-fof-user still work
  await boss.work(
    'discovery/recompute-fof-all',
    { teamSize: 1 },
    async () => { await handleRecomputeFofAll(); },
  );

  // ── Prompt generation & selection ────────────────────────────────────────

  // Weekly batch: generate 20 prompts via Gemini every Monday at 9am UTC
  await boss.schedule('prompts/generate-batch', '0 9 * * 1', {});
  await boss.work(
    'prompts/generate-batch',
    { teamSize: 1 },
    async () => { await handleGeneratePrompts(); },
  );

  // Daily at 2am UTC: mark past-scheduled motives as 'past' (cleanup for missed jobs)
  await boss.schedule('motive/auto-archive', '0 2 * * *', {});
  await boss.work(
    'motive/auto-archive',
    { teamSize: 1 },
    async () => { await handleMotiveAutoArchive(); },
  );

  // Daily at midnight UTC: select best approved prompt for today
  await boss.schedule('prompts/select-daily', '0 0 * * *', {});
  await boss.work(
    'prompts/select-daily',
    { teamSize: 1 },
    async () => { await handleSelectDailyPrompt(); },
  );

  log.info('workers: all workers registered');
}

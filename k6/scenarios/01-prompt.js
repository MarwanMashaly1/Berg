/**
 * Prompt flow: GET today's prompt → respond → fetch matches.
 *
 * Exercises:
 *   - cache.wrap for prompt:today (shared cache, should be HIT after 1st VU)
 *   - POST /respond triggers pg-boss job queue
 *   - cache.wrap for prompt:matches (per-user, MISS on first call)
 *
 * Run standalone:  k6 run k6/scenarios/01-prompt.js -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, assertOk } from '../lib/base.js';
import { pickUser, authHeaders } from '../lib/users.js';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function promptFlow() {
  const user    = pickUser();
  const headers = authHeaders(user);

  // 1. Get today's prompt (should be cache HIT after first VU)
  const todayRes = http.get(`${BASE_URL}/api/prompts/today`, { headers });
  if (!assertOk(todayRes, 'GET /prompts/today')) return;

  const body = todayRes.json();
  const promptId = body?.prompt?.id;
  if (!promptId) return;

  // 2. Respond (each VU picks a different option to spread load)
  const options_ = body?.prompt?.options ?? [];
  if (options_.length > 0) {
    const opt = options_[(__VU - 1) % options_.length];
    const respondRes = http.post(
      `${BASE_URL}/api/prompts/${promptId}/respond`,
      JSON.stringify({ optionKey: opt.key, optionIndex: opt.index }),
      { headers },
    );
    assertOk(respondRes, 'POST /prompts/respond');
  }

  sleep(0.5);

  // 3. Fetch matches (cache MISS first time per user, HIT on repeat)
  const matchRes = http.get(`${BASE_URL}/api/prompts/${promptId}/matches`, { headers });
  assertOk(matchRes, 'GET /prompts/matches');

  sleep(1);
}

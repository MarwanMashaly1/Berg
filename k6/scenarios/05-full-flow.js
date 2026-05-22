/**
 * Composite realistic user journey — what an active user does in one session:
 *
 *   1. Load profile (parallel: me + stats + connections)
 *   2. Open discovery tab (parallel: prompt + people + pulse)
 *   3. Answer today's prompt
 *   4. View match result
 *   5. Check motives list
 *   6. Open chat list, read and send one message
 *
 * This is the primary scenario for load + stress + soak tests.
 *
 * Run standalone:  k6 run k6/scenarios/05-full-flow.js -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, assertOk } from '../lib/base.js';
import { pickUser, authHeaders } from '../lib/users.js';

export const options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function fullFlow() {
  const user    = pickUser();
  const headers = authHeaders(user);

  // ── Step 1: Profile init ──────────────────────────────────────────────────
  const profileBatch = [
    ['GET', `${BASE_URL}/api/users/me`,            null, { headers }],
    ['GET', `${BASE_URL}/api/profile/stats`,       null, { headers }],
    ['GET', `${BASE_URL}/api/profile/connections`, null, { headers }],
  ];
  const [meRes, statsRes, connRes] = http.batch(profileBatch);
  assertOk(meRes,    'init/me');
  assertOk(statsRes, 'init/stats');
  assertOk(connRes,  'init/connections');
  sleep(0.5);

  // ── Step 2: Discovery tab ─────────────────────────────────────────────────
  const discBatch = [
    ['GET', `${BASE_URL}/api/prompts/today`,      null, { headers }],
    ['GET', `${BASE_URL}/api/discovery/people`,   null, { headers }],
    ['GET', `${BASE_URL}/api/discovery/pulse`,    null, { headers }],
  ];
  const [promptRes, peopleRes, pulseRes] = http.batch(discBatch);
  assertOk(promptRes,  'discovery/prompt');
  assertOk(peopleRes,  'discovery/people');
  assertOk(pulseRes,   'discovery/pulse');

  const promptBody = promptRes.json();
  const promptId   = promptBody?.prompt?.id;
  const opts       = promptBody?.prompt?.options ?? [];
  sleep(1);

  // ── Step 3: Answer prompt ─────────────────────────────────────────────────
  if (promptId && opts.length > 0 && !promptBody?.userResponse) {
    const opt = opts[(__VU - 1) % opts.length];
    const respondRes = http.post(
      `${BASE_URL}/api/prompts/${promptId}/respond`,
      JSON.stringify({ optionKey: opt.key, optionIndex: opt.index }),
      { headers },
    );
    assertOk(respondRes, 'prompt/respond');
  }
  sleep(0.5);

  // ── Step 4: Match reveal ──────────────────────────────────────────────────
  if (promptId) {
    const matchRes = http.get(`${BASE_URL}/api/prompts/${promptId}/matches`, { headers });
    assertOk(matchRes, 'prompt/matches');
  }
  sleep(1);

  // ── Step 5: Motives list ──────────────────────────────────────────────────
  const motivesRes = http.get(`${BASE_URL}/api/motives?filter=active`, { headers });
  assertOk(motivesRes, 'motives/list');
  sleep(0.5);

  // ── Step 6: Chat ──────────────────────────────────────────────────────────
  const chatsRes = http.get(`${BASE_URL}/api/chats`, { headers });
  if (assertOk(chatsRes, 'chats/list')) {
    const chatList = chatsRes.json()?.chats ?? [];
    if (chatList.length > 0) {
      const chatId = chatList[0].id;

      const msgsRes = http.get(`${BASE_URL}/api/chats/${chatId}/messages?limit=20`, { headers });
      assertOk(msgsRes, 'chats/messages');
      sleep(0.3);

      // Only half the VUs send — avoids hammering rate limiter
      if (__VU % 2 === 0) {
        const sendRes = http.post(
          `${BASE_URL}/api/chats/${chatId}/messages`,
          JSON.stringify({ content: `Session msg VU${__VU}/${__ITER}`, type: 'text' }),
          { headers },
        );
        if (sendRes.status !== 429) assertOk(sendRes, 'chats/send');
      }
    }
  }

  sleep(2);
}

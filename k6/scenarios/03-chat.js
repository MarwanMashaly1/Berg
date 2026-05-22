/**
 * Chat flow: list chats → read messages → send message.
 *
 * Exercises:
 *   - chats:list cache (HIT after first call; invalidated by message send)
 *   - GET /chats/:id/messages (not cached, marks-as-read on every call)
 *   - POST /chats/:id/messages (rate-limited 60/min, invalidates cache for all members)
 *
 * The seed script puts first 60 test users in one group chat.
 * VUs 1–60 can message; others only read.
 *
 * Run standalone:  k6 run k6/scenarios/03-chat.js -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, assertOk } from '../lib/base.js';
import { pickUser, authHeaders } from '../lib/users.js';

export const options = {
  vus: 30,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.02'],
  },
};

export default function chatFlow() {
  const user    = pickUser();
  const headers = authHeaders(user);

  // 1. List chats (cache HIT after first request per user)
  const listRes = http.get(`${BASE_URL}/api/chats`, { headers });
  if (!assertOk(listRes, 'GET /chats')) return;

  const chatList = listRes.json()?.chats ?? [];
  if (chatList.length === 0) {
    sleep(1);
    return;
  }

  const chatId = chatList[0].id;

  // 2. Read messages (not cached — always fresh)
  const msgRes = http.get(`${BASE_URL}/api/chats/${chatId}/messages?limit=20`, { headers });
  assertOk(msgRes, 'GET /chats/messages');

  sleep(0.3);

  // 3. Send a message (every VU sends, tests cache invalidation + rate limiter)
  const sendRes = http.post(
    `${BASE_URL}/api/chats/${chatId}/messages`,
    JSON.stringify({ content: `k6 message from VU ${__VU} iter ${__ITER}`, type: 'text' }),
    { headers },
  );
  // 429 is acceptable under heavy load — rate limiter is working correctly
  if (sendRes.status !== 429) {
    assertOk(sendRes, 'POST /chats/messages');
  }

  sleep(1);
}

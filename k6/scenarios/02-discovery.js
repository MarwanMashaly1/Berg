/**
 * Discovery read storm: people, circles, pulse.
 *
 * Exercises:
 *   - fof:userId cache (HIT after first VU per user)
 *   - circles:suggest:userId cache
 *   - pulse (NOT cached — always fresh DB queries)
 *
 * Spike scenario: simulate all users opening the discovery tab
 * simultaneously after a push notification.
 *
 * Run standalone:  k6 run k6/scenarios/02-discovery.js -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, assertOk } from '../lib/base.js';
import { pickUser, authHeaders } from '../lib/users.js';

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<600'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function discoveryFlow() {
  const user    = pickUser();
  const headers = authHeaders(user);

  const batch = [
    ['GET', `${BASE_URL}/api/discovery/people`,  null, { headers }],
    ['GET', `${BASE_URL}/api/discovery/circles`, null, { headers }],
    ['GET', `${BASE_URL}/api/discovery/pulse`,   null, { headers }],
  ];

  // Fire all three in parallel (mirrors what the mobile app does on tab open)
  const responses = http.batch(batch);

  assertOk(responses[0], 'GET /discovery/people');
  assertOk(responses[1], 'GET /discovery/circles');
  assertOk(responses[2], 'GET /discovery/pulse');

  sleep(2);
}

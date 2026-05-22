/**
 * Profile read burst: the most frequent request pattern on app open.
 *
 * Exercises:
 *   - user:me cache (2 min TTL)
 *   - profile:stats cache (2 min TTL)
 *   - profile:connections cache (2 min TTL)
 *   - profile:circles cache (5 min TTL)
 *
 * All four fire in parallel — mirrors the mobile app's init sequence.
 * Goal: verify > 80% cache hit rate under steady load.
 *
 * Run standalone:  k6 run k6/scenarios/04-profile.js -e BASE_URL=http://localhost:3000
 */
import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, assertOk } from '../lib/base.js';
import { pickUser, authHeaders } from '../lib/users.js';

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed:   ['rate<0.005'],
    cache_hit_rate:    ['rate>0.7'],
  },
};

export default function profileFlow() {
  const user    = pickUser();
  const headers = authHeaders(user);

  const batch = [
    ['GET', `${BASE_URL}/api/users/me`,              null, { headers }],
    ['GET', `${BASE_URL}/api/profile/stats`,         null, { headers }],
    ['GET', `${BASE_URL}/api/profile/connections`,   null, { headers }],
    ['GET', `${BASE_URL}/api/profile/circles`,       null, { headers }],
  ];

  const [meRes, statsRes, connRes, circlesRes] = http.batch(batch);

  assertOk(meRes,      'GET /users/me');
  assertOk(statsRes,   'GET /profile/stats');
  assertOk(connRes,    'GET /profile/connections');
  assertOk(circlesRes, 'GET /profile/circles');

  // Short think-time: users scroll and come back quickly
  sleep(1.5);
}
